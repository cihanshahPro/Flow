import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ThoughtDraft } from "../drafts";
import type { Task } from "../model";

/**
 * Two local pushes a day: "Your day" in the morning and "Day closed" in the
 * evening. Chases live in Apple Reminders. Best effort: no permission, no
 * platform support, or any failure simply means no push.
 */

const PREFIX = "flow-thread-";

export type PlannedReminder = { id: string; title: string; body: string; at: string };

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
  return { id: MORNING_ID, title: "Your day", body: headline, at: at.toISOString() };
}

export const EVENING_ID = `${PREFIX}evening`;
export const DEFAULT_EVENING = "19:00";

/** Pure: the evening close — how the day went, and the invitation to plan tomorrow. */
export function planEvening(done: number, time: string | undefined, now = new Date()): PlannedReminder {
  const { hour, minute } = parseMorning(time ?? DEFAULT_EVENING);
  let at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  if (at.getTime() <= now.getTime()) at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0);
  return { id: EVENING_ID, title: "Day closed", body: `${done} done today. Plan tomorrow, then let it go.`, at: at.toISOString() };
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
  options: { ask?: boolean; enabled?: boolean; morning?: { headline?: string; time?: string; off?: boolean }; evening?: { done: number; time?: string; off?: boolean } } = {},
): Promise<number> {
  if (Platform.OS === "web") return 0;
  void threads;
  void tasks;
  const planned: PlannedReminder[] = [];
  if (options.morning && !options.morning.off) {
    const m = planMorning(options.morning.headline, options.morning.time, now);
    if (m) planned.push(m);
  }
  if (options.evening && !options.evening.off) planned.push(planEvening(options.evening.done, options.evening.time, now));
  try {
    configure();
    // Flow is the only thing scheduling here; older builds used other ids, so everything goes.
    await Notifications.cancelAllScheduledNotificationsAsync();
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

/** Dev only: schedule one reminder a few seconds out to check delivery on a device. */
export async function sendTestReminder(seconds = 5): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    configure();
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return false;
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + "test",
      content: { title: "Flowthread", body: "Test reminder: notifications work.", sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
    return true;
  } catch {
    return false;
  }
}

/** Dev: what Flow has scheduled, one line each. */
export async function scheduledSummary(): Promise<string[]> {
  if (Platform.OS === "web") return [];
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all
      .map((n) => {
        const t = (n.trigger ?? {}) as { date?: number | string | Date; value?: number; dateComponents?: { hour?: number; minute?: number; day?: number; weekday?: number } };
        const stamp = t.date ?? t.value;
        const when = stamp ? new Date(stamp).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : t.dateComponents ? `${t.dateComponents.day ?? "?"}th ${t.dateComponents.hour ?? "?"}:${String(t.dateComponents.minute ?? 0).padStart(2, "0")}` : "?";
        return `${when} · ${n.content.title}: ${n.content.body}`;
      })
      .sort();
  } catch {
    return [];
  }
}
