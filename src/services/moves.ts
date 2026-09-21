import { loadWorkspace, removeTask, saveTask } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import { completeOnPhone, readBack, readWeek, removeFromPhone, writePlanEvent, writeReminder } from "./calendar-read";
import { completeTask } from "../task-flow";
import { localDate, type Task } from "../model";
import { placeInGap, awayDays, nextOpenDay } from "../calendar";
import { noteMoveDone } from "../thread";

/**
 * One place that changes a move everywhere at once: the task, its calendar
 * event, its Reminder, and the thread it belongs to. Every screen that ticks,
 * moves, edits or deletes goes through here.
 */

export async function tickMove(task: Task, now = new Date()): Promise<Task> {
  const done = completeTask(task, now);
  await saveTask(done);
  await completeOnPhone(done).catch(() => {});
  if (task.projectId) {
    const thread = (await loadDrafts()).find((t) => t.id === task.projectId);
    if (thread) await saveDraft(noteMoveDone(thread, done, { now }));
  }
  return done;
}

export async function untickMove(task: Task): Promise<Task> {
  const open = { ...task, done: false, completedAt: undefined, reviewedAt: undefined };
  await saveTask(open);
  return open;
}

export type MovePatch = { title?: string; plannedDate?: string; plannedTime?: string; deadline?: string; minutes?: number; projectId?: string; evening?: boolean };

/** Edit a move and rewrite what the phone holds for it. Empty date = no day (unplaced). */
export async function editMove(task: Task, patch: MovePatch, now = new Date()): Promise<Task> {
  let next: Task = { ...task, ...patch };
  if (patch.evening !== undefined) next = { ...next, plannedTime: patch.evening ? "19:00" : next.plannedTime || "" };
  if (next.kind === "waiting") {
    if (next.chaseDate && next.reminderId !== undefined) {
      const r = await writeReminder({ ref: next.id, title: `Chase ${next.waitingOn}: ${next.title}`, due: new Date(`${next.chaseDate}T09:00:00`), notes: next.notes }, next.reminderId).catch(() => null);
      if (r) next = { ...next, reminderId: r.id };
    }
  } else if (next.plannedDate && next.plannedTime) {
    const start = new Date(`${next.plannedDate}T${next.plannedTime}:00`);
    const end = new Date(start.getTime() + Math.max(5, next.minutes || 20) * 60000);
    const id = await writePlanEvent({ ref: next.id, title: next.title, start, end, alarmMinutes: 10, notes: next.notes }, next.eventId).catch(() => null);
    next = { ...next, eventId: id ?? undefined };
  } else if (next.eventId) {
    await removeFromPhone({ eventId: next.eventId }).catch(() => {});
    next = { ...next, eventId: undefined };
  }
  await saveTask(next);
  return next;
}

/** Move to a day: the first gap that day (working hours), or all-day when the day is full. */
export async function moveToDay(task: Task, date: string, now = new Date()): Promise<Task> {
  const events = await readWeek(now, 21).catch(() => []);
  const away = awayDays(events);
  const open = nextOpenDay(events.filter((e) => e.ref !== task.id), date, away);
  const slot = placeInGap(events.filter((e) => e.ref !== task.id), open, Math.max(5, task.minutes || 20), now, away);
  return editMove(task, slot ? { plannedDate: slot.date, plannedTime: new Date(slot.start).toTimeString().slice(0, 5) } : { plannedDate: open, plannedTime: "" }, now);
}

export async function moveToTomorrow(task: Task, now = new Date()): Promise<Task> {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return moveToDay(task, localDate(t), now);
}

export async function moveToEvening(task: Task, now = new Date()): Promise<Task> {
  return editMove(task, { plannedDate: task.plannedDate || localDate(now), plannedTime: "19:00" }, now);
}

export async function deleteMove(task: Task): Promise<void> {
  await removeFromPhone(task).catch(() => {});
  await removeTask(task.id);
}

/** What the person did on the phone since last time: ticked reminders, deleted events. Applied to the tasks. */
export async function syncFromPhone(now = new Date()): Promise<{ completed: number; unplaced: number }> {
  const { tasks } = await loadWorkspace();
  const { completed, removed } = await readBack(tasks).catch(() => ({ completed: [], removed: [] }));
  let c = 0, u = 0;
  for (const id of completed) {
    const t = tasks.find((x) => x.id === id);
    if (t && !t.done) {
      await tickMove(t, now);
      c++;
    }
  }
  for (const id of removed) {
    const t = tasks.find((x) => x.id === id);
    if (t && !t.done && t.eventId) {
      await saveTask({ ...t, eventId: undefined, plannedTime: "" });
      u++;
    }
  }
  return { completed: c, unplaced: u };
}

/** Unfinished dated moves from today (and earlier) roll to the next open day; the evening close reports them. */
export async function rollOver(now = new Date()): Promise<Task[]> {
  const today = localDate(now);
  const { tasks } = await loadWorkspace();
  const late = tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && t.plannedDate && t.plannedDate < today);
  const moved: Task[] = [];
  for (const t of late) moved.push(await moveToDay(t, today, now));
  return moved;
}
