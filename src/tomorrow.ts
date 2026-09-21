import { eventsOn, freeSlots, watchOuts, weekDays, type CalEvent, type WatchOut } from "./calendar.ts";
import { localDate, type Task } from "./model.ts";

/**
 * The evening ritual: plan tomorrow before it starts (Sunsama's shutdown,
 * the Ivy Lee list). Pure: what Flow proposes for tomorrow from the
 * calendar, the moves, what today left over, and the person's routines.
 * The device side (writing the day to the phone) is in services/tomorrow.ts.
 */

/** A habit block the person keeps on chosen weekdays: 20 min exercise at 7, reading at 9:30pm. */
export type Routine = { id: string; title: string; time: string; minutes: number; /** 0 = Sunday … 6 = Saturday. */ days: number[]; on: boolean };

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Starting suggestions. Off until the person switches one on. */
export const ROUTINE_SUGGESTIONS: Routine[] = [
  { id: "exercise", title: "Exercise", time: "07:00", minutes: 20, days: EVERY_DAY, on: false },
  { id: "read", title: "Read", time: "21:30", minutes: 15, days: EVERY_DAY, on: false },
  { id: "emails", title: "Emails", time: "09:00", minutes: 20, days: WEEKDAYS, on: false },
  { id: "walk", title: "Walk", time: "12:30", minutes: 20, days: EVERY_DAY, on: false },
];

export function routineTaskId(routine: Routine, date: string): string {
  return `routine:${routine.id}:${date}`;
}

export function routinesOn(routines: Routine[], date: string): Routine[] {
  const day = new Date(`${date}T12:00:00`).getDay();
  return routines.filter((r) => r.on && r.days.includes(day)).sort((a, b) => a.time.localeCompare(b.time));
}

/** A routine as the task Today shows and ticks. */
export function routineTask(routine: Routine, date: string, now = new Date()): Task {
  return {
    id: routineTaskId(routine, date),
    title: routine.title,
    topic: "Life",
    minutes: routine.minutes,
    done: false,
    plannedDate: date,
    plannedTime: routine.time,
    deadline: "",
    waitingOn: "",
    chaseDate: "",
    notes: "",
    createdAt: now.toISOString(),
    kind: "action",
    area: "Health",
    routineId: routine.id,
  };
}

export function tomorrowOf(now = new Date()): string {
  return weekDays(now, 2)[1];
}

export type Proposal = {
  date: string;
  /** Moves already on the list that the person just mentioned for tomorrow (the smart connector). */
  suggested?: Task[];
  events: CalEvent[];
  watch: WatchOut[];
  /** Routines that fall on that weekday and are switched on. */
  routines: Routine[];
  /** Moves already planned for that day. */
  moves: Task[];
  /** Today's unfinished dated moves: kept → moved to tomorrow, dropped → left for later. */
  carry: Task[];
  /** Chases due that day. */
  chases: Task[];
  /** Minutes free in working hours, after the events. */
  freeMinutes: number;
};

/** What Flow puts on the table for tomorrow. Nothing is written until the person locks it in. */
export function proposeTomorrow(events: CalEvent[], tasks: Task[], routines: Routine[], now = new Date()): Proposal {
  const today = localDate(now);
  const date = tomorrowOf(now);
  const open = tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting");
  const dayStart = new Date(`${date}T00:00:00`);
  return {
    date,
    suggested: [],
    events: eventsOn(events, date).filter((e) => !e.mine),
    watch: watchOuts(events, now, 2).filter((w) => w.date === date),
    routines: routinesOn(routines, date),
    moves: open.filter((t) => t.plannedDate === date && !t.routineId).sort((a, b) => (a.plannedTime || "99").localeCompare(b.plannedTime || "99")),
    carry: open.filter((t) => t.plannedDate && t.plannedDate <= today && !t.routineId),
    chases: tasks.filter((t) => !t.done && t.kind === "waiting" && t.chaseDate === date),
    freeMinutes: freeSlots(events, date, dayStart, 5).reduce((n, s) => n + s.minutes, 0),
  };
}

/** What the person decided: which moves stay, which carry-overs come along, what they typed, which routines are on. */
export type Decision = { keep: string[]; carry: string[]; added: string[]; routines: Routine[] };

export function closureLine(p: { moves: number; routines: number; carried: number }): string {
  const bits = [`${p.moves} move${p.moves === 1 ? "" : "s"}`];
  if (p.routines) bits.push(`${p.routines} routine${p.routines === 1 ? "" : "s"}`);
  if (p.carried) bits.push(`${p.carried} from today`);
  return `Tomorrow is set · ${bits.join(" · ")}. Nothing to hold tonight.`;
}

/** The morning line: the day as one sentence, in order. */
export function morningLine(events: CalEvent[], tasks: Task[], date: string): string {
  const day = tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && t.plannedDate === date).sort((a, b) => (a.plannedTime || "99").localeCompare(b.plannedTime || "99"));
  const on = eventsOn(events, date).filter((e) => !e.mine);
  const first = day[0];
  const head = `${on.length} event${on.length === 1 ? "" : "s"} · ${day.length} move${day.length === 1 ? "" : "s"}`;
  return first ? `${head} · first: ${first.title}${first.plannedTime ? " at " + first.plannedTime : ""}` : head;
}

/** What the person said about tomorrow, connected to what is already on the list: known moves to pull in, and new lines. */
export type Suggestion = { existing: Task[]; lines: string[] };

const STOP = new Set(["the", "a", "an", "to", "of", "and", "my", "for", "with", "about", "on", "in", "at", "up", "it", "that", "this", "i", "need", "have", "want", "should", "tomorrow", "then", "also", "just", "get", "do", "go"]);
export function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/** Pure: match spoken items to open moves (same words → same move); what does not match is a new line. */
export function connectToList(items: { title: string; evidence?: string }[], tasks: Task[], date: string): Suggestion {
  const open = tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && !t.routineId);
  const existing: Task[] = [];
  const lines: string[] = [];
  for (const it of items) {
    const w = wordsOf(`${it.title} ${it.evidence ?? ""}`);
    let best: { t: Task; score: number } | null = null;
    for (const t of open) {
      const tw = wordsOf(`${t.title} ${t.notes ?? ""}`);
      if (!tw.size) continue;
      const shared = [...wordsOf(it.title)].filter((x) => tw.has(x)).length;
      const score = shared / Math.max(1, Math.min(wordsOf(it.title).size, wordsOf(t.title).size));
      if (shared >= 1 && score >= 0.5 && (!best || score > best.score)) best = { t, score };
    }
    void w;
    if (best && !existing.some((e) => e.id === best!.t.id)) existing.push(best.t);
    else if (!best && it.title.trim()) lines.push(it.title.trim());
  }
  return { existing: existing.filter((t) => t.plannedDate !== date), lines };
}
