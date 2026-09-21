import { loadRecord, loadWorkspace, saveRecord, saveTask } from "./storage";
import { readWeek } from "./calendar-read";
import { editMove, moveToDay } from "./moves";
import { localDate, type Task } from "../model";
import { placeInGap, awayDays } from "../calendar";
import { closureLine, proposeTomorrow, ROUTINE_SUGGESTIONS, routinesOn, routineTask, routineTaskId, tomorrowOf, type Decision, type Proposal, type Routine } from "../tomorrow";

/**
 * The evening ritual on the device: load the routines, put the proposal
 * together, and lock a day in — routines become tasks, kept carry-overs
 * move, typed lines become moves in the gaps, and the day is recorded.
 */

export async function loadRoutines(): Promise<Routine[]> {
  const saved = await loadRecord<Routine[]>("prefs", "routines").catch(() => null);
  if (!saved) return ROUTINE_SUGGESTIONS;
  // Suggestions the person never touched stay available, off.
  const ids = new Set(saved.map((r) => r.id));
  return [...saved, ...ROUTINE_SUGGESTIONS.filter((r) => !ids.has(r.id))];
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await saveRecord("prefs", "routines", routines);
}

export type DayPlan = { date: string; lockedAt: string; moves: string[]; routines: string[]; closure: string };

export async function dayPlanFor(date: string): Promise<DayPlan | null> {
  return loadRecord<DayPlan>("dayplan", date).catch(() => null);
}

export async function proposal(now = new Date()): Promise<Proposal> {
  const [{ tasks }, events, routines] = await Promise.all([loadWorkspace(), readWeek(now, 3).catch(() => []), loadRoutines()]);
  return proposeTomorrow(events, tasks, routines, now);
}

/** Make sure a day's routine blocks exist as tasks (idempotent). Used at lock-in and at the start of a day that was never planned. */
export async function ensureRoutines(date: string, routines: Routine[], now = new Date()): Promise<Task[]> {
  const { tasks } = await loadWorkspace();
  const made: Task[] = [];
  for (const r of routinesOn(routines, date)) {
    const id = routineTaskId(r, date);
    if (tasks.some((t) => t.id === id)) continue;
    const t = routineTask(r, date, now);
    await saveTask(t);
    made.push(t);
  }
  return made;
}

/** Lock tomorrow in. Returns the closure line. */
export async function lockTomorrow(decision: Decision, now = new Date()): Promise<string> {
  const date = tomorrowOf(now);
  await saveRoutines(decision.routines);
  const { tasks } = await loadWorkspace();
  const events = await readWeek(now, 3).catch(() => []);
  const away = awayDays(events);
  // Moves already on tomorrow that the person unticked go back to unplanned.
  for (const t of tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && t.plannedDate === date && !t.routineId)) {
    if (!decision.keep.includes(t.id)) await editMove(t, { plannedDate: "", plannedTime: "" }, now);
  }
  let carried = 0;
  for (const id of decision.carry) {
    const t = tasks.find((x) => x.id === id);
    if (t) {
      await moveToDay(t, date, now);
      carried++;
    }
  }
  const routines = await ensureRoutines(date, decision.routines, now);
  // Routines that were switched off tonight lose tomorrow's block.
  for (const t of tasks.filter((t) => t.routineId && t.plannedDate === date && !t.done)) {
    if (!routinesOn(decision.routines, date).some((r) => r.id === t.routineId)) await editMove(t, { plannedDate: "", plannedTime: "" }, now);
  }
  let added = 0;
  // Carry-overs just took gaps; read the day again so typed lines land after them, and keep each new one out of the next gap.
  let week = await readWeek(now, 3).catch(() => events);
  for (const line of decision.added.map((s) => s.trim()).filter(Boolean)) {
    const id = `flow:day:${date}:${line.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    if (tasks.some((t) => t.id === id)) continue;
    const slot = placeInGap(week, date, 20, now, away, 1);
    if (slot) week = [...week, { id: `new:${id}`, calendarId: "", title: line, start: slot.start, end: slot.end, allDay: false, mine: true, ref: id }];
    const task: Task = {
      id,
      title: line,
      topic: "Life",
      minutes: 20,
      done: false,
      plannedDate: date,
      plannedTime: slot ? new Date(slot.start).toTimeString().slice(0, 5) : "",
      deadline: "",
      waitingOn: "",
      chaseDate: "",
      notes: "",
      createdAt: now.toISOString(),
      kind: "action",
      area: "Other",
    };
    await saveTask(task);
    if (slot) await editMove(task, {}, now);
    added++;
  }
  const kept = decision.keep.length + added + carried;
  const closure = closureLine({ moves: kept, routines: routines.length + tasks.filter((t) => t.routineId && t.plannedDate === date && routinesOn(decision.routines, date).some((r) => r.id === t.routineId)).length, carried });
  await saveRecord("dayplan", date, { date, lockedAt: now.toISOString(), moves: decision.keep, routines: decision.routines.filter((r) => r.on).map((r) => r.id), closure } satisfies DayPlan);
  return closure;
}

/** At the start of a day nobody planned: the routines still show up. */
export async function startDay(now = new Date()): Promise<number> {
  const date = localDate(now);
  if (await dayPlanFor(date)) return 0;
  const routines = await loadRoutines();
  return (await ensureRoutines(date, routines, now)).length;
}
