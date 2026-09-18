export const TOPICS = ["Life", "Work", "Ideas"] as const;
export type Topic = (typeof TOPICS)[number];
export type Task = {
  id: string;
  title: string;
  topic: Topic;
  minutes: number;
  done: boolean;
  plannedDate: string;
  plannedTime: string;
  deadline: string;
  waitingOn: string;
  chaseDate: string;
  notes: string;
  createdAt: string;
};
export type Note = {
  id: string;
  title: string;
  text: string;
  audioUri?: string;
  durationMs?: number;
  createdAt: string;
};
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return (
    y >= 2000 &&
    y <= 2100 &&
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validateTask(task: Task): void {
  if (!task.title.trim() || task.title.length > 300)
    throw new Error("Give this action a title of 1–300 characters.");
  if (!TOPICS.includes(task.topic)) throw new Error("Choose a topic.");
  if (!Number.isInteger(task.minutes) || task.minutes < 1 || task.minutes > 480)
    throw new Error("Time needed must be between 1 and 480 minutes.");
  for (const date of [task.plannedDate, task.deadline, task.chaseDate])
    if (date && !validDate(date))
      throw new Error("Use a real date in YYYY-MM-DD format.");
  if (task.plannedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.plannedTime))
    throw new Error("Use a time in 24-hour HH:mm format.");
  if (task.plannedTime && !task.plannedDate)
    throw new Error("Add a planned date for this time.");
  if (task.notes.length > 20000 || task.waitingOn.length > 300)
    throw new Error("This note or contact is too long.");
}
export function calendarDraft(task: Task) {
  validateTask(task);
  if (!task.plannedDate || !task.plannedTime)
    throw new Error("Edit this action and add a planned date and time first.");
  const [y, m, d] = task.plannedDate.split("-").map(Number);
  const [h, min] = task.plannedTime.split(":").map(Number);
  const startDate = new Date(y, m - 1, d, h, min);
  if (startDate.getHours() !== h || startDate.getMinutes() !== min)
    throw new Error(
      "This time does not exist because of a daylight-saving change. Choose another time.",
    );
  return {
    title: task.title,
    startDate,
    endDate: new Date(startDate.getTime() + task.minutes * 60000),
    notes: task.notes,
  };
}
export function todayTasks(
  tasks: Task[],
  minutes: number,
  today = localDate(),
): Task[] {
  return tasks
    .filter(
      (t) =>
        !t.done &&
        t.minutes <= minutes &&
        (!t.plannedDate || t.plannedDate <= today),
    )
    .sort((a, b) => {
      const rank = (t: Task) =>
        t.deadline && t.deadline <= today
          ? 0
          : t.chaseDate && t.chaseDate <= today
            ? 1
            : t.plannedDate === today
              ? 2
              : 3;
      return (
        rank(a) - rank(b) ||
        (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
        a.createdAt.localeCompare(b.createdAt)
      );
    });
}
