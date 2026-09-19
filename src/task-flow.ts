import { localDate, validDate, type Task } from "./model.ts";

export type TaskState =
  "ready" | "later" | "waiting" | "blocked" | "check-in" | "done";

/** One interpretation of saved action state for Home, the map and its editor. */
export function taskState(task: Task, today = localDate()): TaskState {
  if (task.done)
    return task.completedAt && !task.reviewedAt ? "check-in" : "done";
  if (task.followUp === "blocked") return "blocked";
  if (task.followUp === "waiting" || task.waitingOn?.trim()) return "waiting";
  if (task.plannedDate && task.plannedDate > today) return "later";
  return "ready";
}

export function taskIsDue(task: Task, today = localDate()): boolean {
  const state = taskState(task, today);
  return (
    state === "ready" ||
    ((state === "waiting" || state === "blocked") &&
      !!task.chaseDate &&
      task.chaseDate <= today)
  );
}

function date(value: string): string {
  if (!validDate(value))
    throw new Error("Choose a real date in YYYY-MM-DD format.");
  return value;
}

function instant(now: Date | string): string {
  const value = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(value.getTime()))
    throw new Error("Use a valid completion time.");
  return value.toISOString();
}

export function completeTask(
  task: Task,
  now: Date | string = new Date(),
): Task {
  // Repeated completion must not reopen a reviewed check-in or rewrite history.
  if (task.done) return { ...task };
  return {
    ...task,
    done: true,
    completedAt: instant(now),
    reviewedAt: undefined,
  };
}

export function reviewTask(task: Task, now: Date | string = new Date()): Task {
  if (!task.done || task.reviewedAt) return { ...task };
  return { ...task, reviewedAt: instant(now) };
}

export function resumeTask(task: Task, today = localDate()): Task {
  return {
    ...task,
    plannedDate: date(today),
    plannedTime: "",
    followUp: undefined,
    waitingOn: "",
    chaseDate: "",
  };
}

export function postponeTask(task: Task, plannedDate: string): Task {
  return {
    ...task,
    plannedDate: date(plannedDate),
    plannedTime: "",
    followUp: undefined,
    waitingOn: "",
    chaseDate: "",
  };
}

export function holdTask(
  task: Task,
  kind: "waiting" | "blocked",
  chaseDate: string,
): Task {
  return { ...task, followUp: kind, chaseDate: date(chaseDate) };
}
