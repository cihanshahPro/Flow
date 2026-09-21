import { awayDays, nextOpenDay, placeInGap, type CalEvent, type FreeSlot } from "./calendar.ts";
import { localDate } from "./model.ts";
import { whenFromAnswer } from "./when.ts";
import { contentWords } from "./words.ts";
import { extractDueHints } from "./thread.ts";

/**
 * The map: one tree the person never sees but everything lands in.
 *
 *   Area → Project (= a thread) → Action / Waiting / Later
 *            ↕ people                 ↕ events (from the calendar)
 *
 * Seven kinds of node, no more. A project has one area; an item has one
 * project, or sits on its area when it is a one-off. Matching is code:
 * same person → same project; same topic words → same project; a date that
 * is already on the calendar → that event; nothing matches → a new project
 * under the best area. (GTD: areas of focus, projects, next actions,
 * waiting-for, someday/maybe.)
 */

export const AREAS = ["Work", "Money", "Legal & admin", "Health", "Home", "Family & friends", "Learning", "Other"] as const;
export type Area = (typeof AREAS)[number];

const AREA_WORDS: Record<Area, RegExp> = {
  Work: /\b(work|job|boss|manager|client|clients|team|office|project|demo|deadline|launch|portfolio|app|apps|website|business|startup|amazon|fba|invoice|invoices|sales|customer|meeting|presentation|pitch|hire|interview|freelance|design(?:er)?|code|ship)\b/i,
  Money: /\b(money|bill|bills|rent|tax|taxes|bank|budget|loan|debt|insurance|quote|quotes|pay|payment|salary|invoice|refund|subscription|renewal|renews|policy)\b/i,
  "Legal & admin": /\b(lawyer|attorney|court|case|hearing|legal|visa|passport|immigration|green card|ard|dui|dey|ticket|fine|form|forms|paperwork|contract|lease|landlord|license|licence|registration|embassy|application)\b/i,
  Health: /\b(doctor|dentist|gym|health|medical|exam|exams|therapy|therapist|sleep|workout|run|running|diet|clinic|hospital|prescription|appointment|surgery|knee|back pain|checkup)\b/i,
  Home: /\b(home|house|flat|apartment|repair|fix|garage|kitchen|bathroom|tap|fan|plumber|electrician|clean|cleaning|move|moving|furniture|garden|car|mot|tyres|tires)\b/i,
  "Family & friends": /\b(mum|mom|dad|mother|father|parents|sister|brother|wife|husband|partner|girlfriend|boyfriend|kids?|son|daughter|family|friend|friends|birthday|bday|dinner|wedding|anniversary|call (?:my )?(?:mum|mom|dad))\b/i,
  Learning: /\b(learn|learning|course|study|studying|exam|class|book|reading|practice|practise|language|lesson|tutorial|degree|thesis)\b/i,
  Other: /$^/,
};

/** The best area for a piece of text, by its words; "Other" when nothing fits. */
export function areaFor(text: string): Area {
  let best: Area = "Other", score = 0;
  for (const area of AREAS) {
    if (area === "Other") continue;
    const hits = (text.match(new RegExp(AREA_WORDS[area].source, "gi")) ?? []).length;
    if (hits > score) {
      best = area;
      score = hits;
    }
  }
  return best;
}

export type ItemKind = "action" | "waiting" | "later" | "appointment";

/** One thing the person said, as the model (or the local pass) read it. */
export type PlanItem = {
  title: string;
  kind: ItemKind;
  /** The project this belongs to, in 2–5 words; empty for a one-off. */
  project: string;
  area?: Area;
  person?: string;
  /** The date as the person said it ("tomorrow", "Monday", "end of month"); empty when none. */
  when?: string;
  minutes?: number;
  /** Their words, verbatim. */
  evidence: string;
};

export type ProjectRef = { id: string; title: string; area?: Area; people?: string[]; words: string };

/** Attach each item to an existing project when it clearly belongs, else keep its own project title. */
export function attachItems(items: PlanItem[], projects: ProjectRef[]): (PlanItem & { projectId?: string; area: Area })[] {
  return items.map((item) => {
    const area = item.area ?? areaFor(`${item.title} ${item.project} ${item.evidence}`);
    const words = contentWords(`${item.title} ${item.project} ${item.evidence}`);
    let best: { id: string; score: number } | null = null;
    for (const p of projects) {
      const person = item.person && (p.people ?? []).some((x) => same(x, item.person!));
      const titleWords = contentWords(p.title);
      let named = 0;
      for (const w of titleWords) if (words.has(w)) named++;
      const pw = contentWords(p.words);
      let shared = 0;
      for (const w of words) if (pw.has(w)) shared++;
      const score = (person ? 2 : 0) + named + shared / Math.max(4, words.size);
      if ((person || named >= 2 || (named >= 1 && shared >= 3)) && (!best || score > best.score)) best = { id: p.id, score };
    }
    return { ...item, area, ...(best ? { projectId: best.id } : {}) };
  });
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type Placement = {
  item: PlanItem & { projectId?: string; area: Area };
  /** Where it lands: a dated slot, an all-day date, a chase date, or nothing (later). */
  date?: string;
  slot?: FreeSlot;
  chaseDate?: string;
  /** "by Friday": the due date, separate from the day it is done. */
  deadline?: string;
  /** Why it landed there when the person's own date was moved. */
  note?: string;
};

const DEFAULT_MINUTES: Record<ItemKind, number> = { action: 20, appointment: 60, waiting: 5, later: 0 };

/**
 * Put the items on the week around what is already there. Dated things keep
 * their day (moved past full days and trips); undated actions go into the
 * first gap; waiting-fors get a chase date three working days out, after
 * any trip; later stays off the calendar.
 */
export function placePlan(items: (PlanItem & { projectId?: string; area: Area })[], events: CalEvent[], now = new Date()): Placement[] {
  const away = awayDays(events);
  const placed: CalEvent[] = [...events];
  const today = localDate(now);
  const out: Placement[] = [];
  for (const item of items) {
    const said = dateFromWords(item.when, now);
    const minutes = item.minutes ?? DEFAULT_MINUTES[item.kind];
    if (item.kind === "later") {
      out.push({ item });
      continue;
    }
    if (item.kind === "waiting") {
      const from = said?.date ?? plusWorkingDays(today, 3);
      const chaseDate = nextOpenDay(placed, from, away);
      out.push({ item, chaseDate, ...(chaseDate !== from ? { note: "moved past a full day" } : {}) });
      continue;
    }
    // action or appointment
    // "by Friday" is a deadline: the move goes into the first gap before it, and carries the due date.
    const deadline = said && isDeadline(item.when) ? said.date : undefined;
    let date = deadline ? today : (said?.date ?? today);
    if (date < today) date = today;
    let note: string | undefined;
    // The clock the person gave: that slot when it is free, otherwise the next gap with a note.
    const saidTime = said?.time && (clockIn(item.when ?? "") || /\b(evening|tonight|morning|afternoon|noon|lunch)\b/i.test(item.when ?? "")) ? said.time : undefined;
    if (item.kind === "action" && saidTime && !deadline) {
      const start = new Date(`${date}T${saidTime}:00`);
      const end = new Date(start.getTime() + minutes * 60000);
      const clash = placed.some((e) => !e.allDay && new Date(e.start) < end && new Date(e.end) > start);
      if (!clash && !away.has(date) && start.getTime() > now.getTime() - 5 * 60000) {
        const slot: FreeSlot = { date, start: start.toISOString(), end: end.toISOString(), minutes };
        out.push({ item, date, slot });
        placed.push(fake(item.title, slot));
        continue;
      }
      note = clash ? `${saidTime} is taken` : undefined;
    }
    if (item.kind === "appointment" && said?.time) {
      const start = new Date(`${date}T${said.time}:00`);
      const slot: FreeSlot = { date, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString(), minutes };
      out.push({ item, date, slot });
      placed.push(fake(item.title, slot));
      continue;
    }
    const open = nextOpenDay(placed, date, away);
    if (open !== date) note = away.has(date) ? "you're away that day" : "that day is full";
    const slot = placeInGap(placed, open, minutes, now, away);
    if (slot) {
      if (slot.date !== open && !note) note = "first gap";
      out.push({ item, date: slot.date, slot, note, ...(deadline ? { deadline } : {}) });
      placed.push(fake(item.title, slot));
    } else out.push({ item, date: open, note: note ?? "no gap this week", ...(deadline ? { deadline } : {}) });
  }
  return out;
}

/** "tomorrow", "Monday", "end of month", "Nov 3", "this evening" → a date (and a time when one was said). */
/** "10am", "2:30pm", "at 14:00" said in the words, as "HH:MM"; the clock the person gave beats any default. */
export function clockIn(words: string): string | undefined {
  const t = words.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (t) return `${String((Number(t[1]) % 12) + (t[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${t[2] ?? "00"}`;
  const h = words.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (h && Number(h[1]) < 24) return `${String(Number(h[1])).padStart(2, "0")}:${h[2] ?? "00"}`;
  return undefined;
}

/** "by Friday", "before the end of the month": a deadline, not a day to do it. */
export function isDeadline(words: string | undefined): boolean {
  return /^\s*(?:by|before|until|no later than)\b/i.test(words ?? "");
}

export function dateFromWords(words: string | undefined, now = new Date()): { date: string; time?: string } | undefined {
  if (!words?.trim()) return undefined;
  const clock = clockIn(words);
  const w = whenFromAnswer(words, now);
  if (w) return { date: w.date, time: clock ?? w.time };
  const hint = extractDueHints(words, now)[0];
  if (hint) return { date: hint.date, ...(clock ? { time: clock } : {}) };
  return undefined;
}

function fake(title: string, slot: FreeSlot): CalEvent {
  return { id: `plan:${slot.start}`, calendarId: "", title, start: slot.start, end: slot.end, allDay: false, mine: true };
}

export function plusWorkingDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  let left = n;
  while (left > 0) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return localDate(cur);
}

/** Calendar events that belong to a project, by its title and people words. */
export function matchEvents(events: CalEvent[], projects: ProjectRef[]): Map<string, CalEvent[]> {
  const out = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (e.mine) continue;
    const ew = contentWords(e.title);
    if (!ew.size) continue;
    let best: { id: string; score: number } | null = null;
    for (const p of projects) {
      const pw = contentWords(`${p.title} ${(p.people ?? []).join(" ")} ${p.words}`);
      let shared = 0;
      for (const w of ew) if (pw.has(w)) shared++;
      const score = shared / ew.size;
      if (shared >= 1 && score >= 0.5 && (!best || score > best.score)) best = { id: p.id, score };
    }
    if (!best) {
      // No shared words: an event of one clear area belongs to the only project in that area (Court hearing → the DUI case).
      const area = areaFor(e.title);
      const same = area === "Other" ? [] : projects.filter((p) => p.area === area);
      if (same.length === 1) best = { id: same[0].id, score: 0.5 };
    }
    if (best) out.set(best.id, [...(out.get(best.id) ?? []), e]);
  }
  return out;
}

/** GTD: a project is an outcome that needs more than one action. Everything else is a one-off on its area. */
export function isProject(items: PlanItem[], projectTitle: string): boolean {
  const mine = items.filter((i) => i.project === projectTitle);
  return mine.length >= 2 || mine.some((i) => i.kind === "waiting") || mine.some((i) => i.kind === "later" && mine.length > 1);
}
