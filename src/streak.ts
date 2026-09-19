import { localDate, type Task } from "./model.ts";

/**
 * Consecutive days with at least one finished move. Today not being done yet
 * does not break the run: it stays alive until the day is over.
 */
export function streakDays(tasks: Pick<Task, "done" | "completedAt">[], now = new Date()): number {
  const days = new Set(
    tasks.filter((t) => t.done && t.completedAt).map((t) => localDate(new Date(t.completedAt as string))),
  );
  if (!days.size) return 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDate(day))) day.setDate(day.getDate() - 1);
  let n = 0;
  while (days.has(localDate(day))) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

export function streakLabel(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}
