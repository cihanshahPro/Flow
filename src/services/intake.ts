import { loadWorkspace, saveRecord, saveTask } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import { loadProfile } from "./profile";
import { appendPlanUpdate, suggestDraft, type ThoughtDraft } from "../drafts";
import type { Note, Task, Topic } from "../model";
import { localDate } from "../model";
import { calendarContextText, type PlanShapeItem } from "../ai-policy";
import { planText, type ShapeOptions } from "./processors";
import { readWeek, writePlanEvent, writeReminder } from "./calendar-read";
import { eventsOn, timeLabel, watchOuts, weekDays, type CalEvent, type WatchOut } from "../calendar";
import { attachItems, placePlan, type Area, type Placement, type PlanItem, type ProjectRef } from "../map";
import { contentWords as contentWordsOf, localPlan } from "../intake";
import { extractDueHints, respondToRecording } from "../thread";

/**
 * The intake. The person talks; Flow reads the calendar, reads their words
 * into plan items (one model call, local pass as the floor), attaches each
 * item to the map, places it around the week, writes the dated ones to the
 * phone and shows the week. It ends with closure, never a question.
 */

export type WeekPlan = {
  noteId: string;
  placements: Placement[];
  /** The week after placing: the person's events plus Flow's. */
  events: CalEvent[];
  watch: WatchOut[];
  projects: { id: string; title: string; area: Area; fresh: boolean }[];
  tasks: Task[];
  closure: string;
  source: "model" | "local";
};

function topicFor(area: Area): Topic {
  return area === "Work" || area === "Money" || area === "Legal & admin" ? "Work" : area === "Learning" ? "Ideas" : "Life";
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
}

/** Lines the model may read so "after court" or "when I'm back" mean something. */
export function calendarLines(events: CalEvent[], now = new Date()): string[] {
  const lines: string[] = [];
  for (const date of weekDays(now, 7)) {
    const on = eventsOn(events, date).filter((e) => !e.mine);
    if (!on.length) continue;
    const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
    lines.push(`${day}: ${on.map((e) => (e.allDay ? e.title : `${e.title} ${timeLabel(e.start)}`)).join("; ")}`);
  }
  return lines;
}

/** The map as the model may know it, so a new recording lands on the projects it names. */
export function projectsContextText(threads: { title: string; people?: string[] }[]): string {
  if (!threads.length) return "";
  return "KNOWN PROJECTS (use the same project string when something belongs to one):\n" + threads.slice(0, 20).map((t) => `${t.title}${t.people?.length ? ` (${t.people.join(", ")})` : ""}`).join("\n");
}

export function closureLine(placements: Placement[], watch: WatchOut[]): string {
  const dated = placements.filter((p) => p.slot || p.chaseDate).length;
  if (!placements.length) return "Nothing to plan from that — but it's saved.";
  const bits = [`${placements.length} thing${placements.length === 1 ? "" : "s"} placed`];
  if (dated) bits.push(`${dated} on your calendar`);
  if (watch.length) bits.push(`${watch.length} to watch`);
  return `✅ That's everything. ${bits.join(" · ")}. Nothing left in your head — see you tomorrow morning.`;
}

/** Run the intake for a saved, transcribed dump. Everything it creates is saved before it returns. */
export async function runIntake(note: Note, text: string, options: ShapeOptions = {}): Promise<WeekPlan> {
  const now = options.now ?? new Date();
  const [profile, threads, workspace, events] = await Promise.all([
    loadProfile().catch(() => null),
    loadDrafts(),
    loadWorkspace().catch(() => ({ tasks: [] as Task[], notes: [] as Note[] })),
    readWeek(now).catch(() => [] as CalEvent[]),
  ]);
  // 1. Read the words into items: the model when it answers, the local pass otherwise.
  const live0 = threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt);
  const context = [calendarContextText(calendarLines(events, now)), projectsContextText(live0)].filter(Boolean).join("\n\n");
  const outcome = await planText(text, context, options);
  // Items that merely restate a calendar event are the model reading the context back; they are not new.
  const known = events.filter((e) => !e.mine).map((e) => contentWordsOf(e.title));
  const restates = (i: PlanShapeItem) => {
    const w = contentWordsOf(i.title);
    return w.size > 0 && known.some((k) => k.size > 0 && [...w].filter((x) => k.has(x)).length / Math.min(w.size, k.size) >= 0.6);
  };
  const modelItems = (outcome.plan?.items ?? []).filter((i) => !restates(i));
  const items: PlanItem[] = modelItems.length ? modelItems.map(fromShape) : localPlan(text, now);
  // 2. Attach each item to the map.
  const live = live0;
  const refs: ProjectRef[] = live.map((t) => ({ id: t.id, title: t.title, area: t.area, people: t.people, words: [t.source, ...t.updates].join(" ") }));
  const attached = attachItems(items, refs);
  // 3. Place around the week.
  const placements = placePlan(attached, events, now);
  // 4. Projects: a thread per project (GTD: more than one step, or a named outcome); one-offs sit on their area.
  const projects = new Map<string, { id: string; title: string; area: Area; fresh: boolean; items: typeof attached }>();
  for (const item of attached) {
    const key = item.projectId ?? (item.project.trim() ? `new:${slug(item.project)}` : "");
    if (!key) continue;
    const existing = item.projectId ? live.find((t) => t.id === item.projectId) : undefined;
    const p = projects.get(key) ?? { id: item.projectId ?? `${note.id}:${slug(item.project)}`, title: existing?.title ?? capitalise(item.project.trim()), area: existing?.area ?? item.area, fresh: !existing, items: [] };
    p.items.push(item);
    projects.set(key, p);
  }
  const savedThreads: ThoughtDraft[] = [];
  for (const p of projects.values()) {
    const words = p.items.map((i) => i.evidence).join(" ");
    const people = [...new Set(p.items.map((i) => i.person).filter((x): x is string => !!x))];
    if (p.fresh) {
      const seeded: ThoughtDraft = { ...suggestDraft(p.id, words), title: p.title, area: p.area, people, sourceNoteIds: [note.id], dueHints: extractDueHints(words, now), createdAt: note.createdAt };
      const started = respondToRecording(seeded, note.id, words, { plate: profile?.plate ?? undefined, quiet: true, now });
      await saveDraft(started);
      savedThreads.push(started);
    } else {
      const thread = live.find((t) => t.id === p.id)!;
      const updated = respondToRecording(appendPlanUpdate(thread, suggestDraft(`${note.id}:${slug(p.title)}`, words)), `${note.id}:${slug(p.title)}`, words, { plate: profile?.plate ?? undefined, quiet: true, now });
      const merged = { ...updated, people: [...new Set([...(thread.people ?? []), ...people])], sourceNoteIds: [...new Set([...(updated.sourceNoteIds ?? []), note.id])] };
      await saveDraft(merged);
      savedThreads.push(merged);
    }
  }
  // 5. Tasks: one per placed item; dated ones go to the phone.
  const tasks: Task[] = [];
  const written: CalEvent[] = [];
  for (const [i, pl] of placements.entries()) {
    const it = pl.item;
    const key = it.projectId ?? (it.project.trim() ? `new:${slug(it.project)}` : "");
    const project = key ? projects.get(key) : undefined;
    const id = project ? `flow:${project.id}:${slug(it.title)}-${i}` : `flow:area:${slug(it.area)}:${slug(it.title)}-${i}`;
    if (workspace.tasks.some((t) => t.id === id)) continue;
    const time = pl.slot ? `${String(new Date(pl.slot.start).getHours()).padStart(2, "0")}:${String(new Date(pl.slot.start).getMinutes()).padStart(2, "0")}` : "";
    const task: Task = {
      id,
      title: it.title,
      topic: topicFor(it.area),
      minutes: Math.min(480, Math.max(1, it.minutes ?? (it.kind === "appointment" ? 60 : 20))),
      done: false,
      plannedDate: pl.slot ? pl.slot.date : (pl.date ?? ""),
      plannedTime: time,
      deadline: "",
      waitingOn: it.kind === "waiting" ? (it.person ?? project?.title ?? "someone") : "",
      chaseDate: pl.chaseDate ?? "",
      notes: it.evidence,
      createdAt: now.toISOString(),
      ...(it.kind === "waiting" ? { followUp: "waiting" as const } : {}),
      kind: it.kind,
      area: it.area,
      ...(project ? { projectId: project.id } : {}),
      ...(it.kind === "later" ? { later: true } : {}),
    };
    if (pl.slot && it.kind !== "waiting") {
      const eventId = await writePlanEvent({ ref: task.id, title: task.title, start: new Date(pl.slot.start), end: new Date(pl.slot.end), alarmMinutes: 10, notes: it.evidence }).catch(() => null);
      if (eventId) {
        task.eventId = eventId;
        written.push({ id: eventId, calendarId: "", title: task.title, start: pl.slot.start, end: pl.slot.end, allDay: false, mine: true, ref: task.id });
      }
    } else if (pl.chaseDate) {
      const due = new Date(`${pl.chaseDate}T09:00:00`);
      const r = await writeReminder({ ref: task.id, title: `Chase ${task.waitingOn}: ${task.title}`, due, notes: it.evidence }).catch(() => null);
      if (r) {
        task.reminderId = r.id;
        if (r.via === "calendar") written.push({ id: r.id, calendarId: "", title: task.title, start: `${pl.chaseDate}T00:00:00.000Z`, end: `${pl.chaseDate}T23:59:59.000Z`, allDay: true, mine: true, ref: task.id });
      }
    }
    await saveTask(task);
    tasks.push(task);
  }
  const week = [...events.filter((e) => !written.some((w) => w.id === e.id)), ...written].sort((a, b) => a.start.localeCompare(b.start));
  const watch = watchOuts(events, now);
  // Kept for replay: what was said, what the week held, what the model read, where it landed. Exported with everything else.
  await saveRecord("intake", `intake:${note.id}`, {
    noteId: note.id,
    at: now.toISOString(),
    text,
    calendar: events.filter((e) => !e.mine).map(({ id, title, start, end, allDay }) => ({ id, title, start, end, allDay })),
    projects: live0.map((t) => ({ id: t.id, title: t.title, area: t.area, people: t.people })),
    source: modelItems.length ? "model" : "local",
    modelItems: outcome.plan?.items ?? [],
    items,
    placements: placements.map((p) => ({ title: p.item.title, kind: p.item.kind, project: p.item.project, projectId: p.item.projectId, area: p.item.area, date: p.date, start: p.slot?.start, chaseDate: p.chaseDate, note: p.note })),
  }).catch(() => {});
  return {
    noteId: note.id,
    placements,
    events: week,
    watch,
    projects: [...projects.values()].map(({ id, title, area, fresh }) => ({ id, title, area, fresh })),
    tasks,
    closure: closureLine(placements, watch),
    source: modelItems.length ? "model" : "local",
  };
}

function fromShape(i: PlanShapeItem): PlanItem {
  return { title: i.title, kind: i.kind, project: i.project, ...(i.area ? { area: i.area } : {}), ...(i.person ? { person: i.person } : {}), ...(i.when ? { when: i.when } : {}), ...(i.minutes ? { minutes: i.minutes } : {}), evidence: i.evidence };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Today, as the morning screen sees it: the person's events, Flow's moves, chases due, tomorrow's watch-out. */
export function dayPlan(events: CalEvent[], tasks: Task[], now = new Date()) {
  const today = localDate(now);
  const tomorrow = weekDays(now, 2)[1];
  return {
    date: today,
    events: eventsOn(events, today),
    moves: tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && t.plannedDate === today),
    chases: tasks.filter((t) => !t.done && t.kind === "waiting" && t.chaseDate && t.chaseDate <= today),
    tomorrow: watchOuts(events, now, 2).filter((w) => w.date === tomorrow),
  };
}
