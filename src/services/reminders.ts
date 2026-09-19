import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ThoughtDraft } from "../drafts";
import type { Task } from "../model";
import { localDate } from "../model";
import { pendingMessage, stageFor, threadTasks } from "../thread";

/**
 * Local reminders so Flow can knock when a check-in becomes due while the
 * app is closed. Best effort: no permission, no platform support, or any
 * failure simply means no reminder. Nothing here blocks saving a thought.
 */

const PREFIX = "flow-thread-";
const HOUR = 9;
export const MAX_REMINDERS = 8;

export type PlannedReminder = { id: string; title: string; body: string; at: string };

/** Pure: which reminders Flow would schedule from the current threads. */
export function planReminders(
  threads: ThoughtDraft[],
  tasks: Task[],
  now = new Date(),
): PlannedReminder[] {
  const today = localDate(now);
  const planned: PlannedReminder[] = [];
  const at = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    // The morning after the day the person mentioned.
    return new Date(y, m - 1, d + 1, HOUR, 0, 0).toISOString();
  };
  for (const thread of threads) {
    if (thread.example || thread.state === "parked" || thread.resolvedAt) continue;
    const stage = stageFor(thread, tasks);
    if (stage === "done") continue;
    if (pendingMessage(thread)) {
      // Something is already waiting; one gentle nudge tomorrow morning.
      planned.push({
        id: `${PREFIX}${thread.id}-pending`,
        title: "Flow",
        body: `Something is waiting on you in “${thread.title}”.`,
        at: at(today),
      });
      continue;
    }
    const dates = [
      ...(thread.dueHints ?? []).map((h) => h.date),
      ...threadTasks(thread, tasks)
        .filter((t) => !t.done && t.plannedDate)
        .map((t) => t.plannedDate),
    ].filter((d) => d >= today);
    const next = dates.sort()[0];
    if (!next) continue;
    planned.push({
      id: `${PREFIX}${thread.id}-${next}`,
      title: "Flow",
      body: `Quick check-in on “${thread.title}” when you have a second.`,
      at: at(next),
    });
  }
  return planned.sort((a, b) => a.at.localeCompare(b.at)).slice(0, MAX_REMINDERS);
}

export const MORNING_ID = `${PREFIX}morning`;
export const DEFAULT_MORNING = "08:30";

export function parseMorning(value: string | undefined): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? DEFAULT_MORNING);
  const hour = m ? Number(m[1]) : 8;
  const minute = m ? Number(m[2]) : 30;
  return hour < 24 && minute < 60 ? { hour, minute } : { hour: 8, minute: 30 };
}

/** Pure: the morning nudge, only when there is an open move. `headline` is the move as the Next card words it. */
export function planMorning(headline: string | undefined, time: string | undefined, now = new Date()): PlannedReminder | undefined {
  if (!headline) return undefined;
  const { hour, minute } = parseMorning(time);
  let at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  if (at.getTime() <= now.getTime()) at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0);
  return { id: MORNING_ID, title: "Flow", body: `Today's one move is ready: ${headline}`, at: at.toISOString() };
}

let configured = false;
function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Replace Flow's scheduled reminders with the current plan. Permission is
 * requested only when the person has just confirmed a move or date (`ask`).
 */
export async function syncReminders(
  threads: ThoughtDraft[],
  tasks: Task[],
  now = new Date(),
  /** `ask`: the person just confirmed a move or date, so this is the moment to request permission. `enabled`: the Settings switch. */
  options: { ask?: boolean; enabled?: boolean; morning?: { headline?: string; time?: string; off?: boolean } } = {},
): Promise<number> {
  if (Platform.OS === "web") return 0;
  const planned = planReminders(threads, tasks, now);
  if (options.morning && !options.morning.off) {
    const m = planMorning(options.morning.headline, options.morning.time, now);
    if (m) planned.push(m);
  }
  try {
    configure();
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of existing) {
      if (n.identifier.startsWith(PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    if (!planned.length || options.enabled === false) return 0;
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && options.ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 0;
    let count = 0;
    for (const r of planned) {
      const date = new Date(r.at);
      if (date.getTime() <= now.getTime()) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, sound: false },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
      });
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}
