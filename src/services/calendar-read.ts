// SDK 57 moved this function API to /legacy; the root import now throws deprecation errors.
import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";
import { FLOW_REF, refOf, type CalEvent } from "../calendar";
import { database } from "./storage";

/**
 * The phone's calendars, read and written through iOS: Apple Calendar and any
 * Google (or other) account added to the phone. One permission. Flow reads
 * the coming days to plan around them and writes its own items into the
 * gaps; every Flow event carries a "Flowthread: <ref>" note so it is
 * recognised on the next read and never duplicated.
 */

export async function calendarConnected(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (!(await Calendar.isAvailableAsync())) return false;
    return (await Calendar.getCalendarPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Ask once. True when Flow may read and write the calendar. */
export async function connectCalendar(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    if (!(await Calendar.isAvailableAsync())) return false;
    let p = await Calendar.getCalendarPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Calendar.requestCalendarPermissionsAsync();
    return p.granted;
  } catch {
    return false;
  }
}

export async function remindersConnected(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return (await Calendar.getRemindersPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function connectReminders(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    let p = await Calendar.getRemindersPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Calendar.requestRemindersPermissionsAsync();
    return p.granted;
  } catch {
    return false;
  }
}

export type PhoneCalendar = { id: string; title: string; source: string; color?: string; writable: boolean; on: boolean };

async function prefs() {
  const db = await database();
  await db.execAsync("CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);");
  return db;
}

/** Calendars switched off in Me: not read, not planned around. */
export async function calendarsOff(): Promise<Set<string>> {
  try {
    const db = await prefs();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key=?", "calendars_off");
    return new Set(row ? (JSON.parse(row.value) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function setCalendarOn(id: string, on: boolean): Promise<void> {
  const off = await calendarsOff();
  if (on) off.delete(id);
  else off.add(id);
  const db = await prefs();
  await db.runAsync("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)", "calendars_off", JSON.stringify([...off]));
}

/** The phone's calendars as Me lists them. */
export async function listCalendars(): Promise<PhoneCalendar[]> {
  if (!(await calendarConnected())) return [];
  try {
    const off = await calendarsOff();
    const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return all.map((c) => ({ id: c.id, title: c.title, source: c.source?.name ?? c.source?.type ?? "", color: c.color ?? undefined, writable: !!c.allowsModifications, on: !off.has(c.id) }));
  } catch {
    return [];
  }
}

/** Every event on the phone between two instants, oldest first. Calendars switched off are skipped. */
export async function readEvents(from: Date, to: Date): Promise<CalEvent[]> {
  if (!(await calendarConnected())) return [];
  const off = await calendarsOff();
  const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => !off.has(c.id));
  if (!calendars.length) return [];
  const names = new Map(calendars.map((c) => [c.id, c.title]));
  const events = await Calendar.getEventsAsync(calendars.map((c) => c.id), from, to);
  return events
    .map((e) => {
      const ref = refOf(e.notes);
      return {
        id: e.id,
        calendarId: e.calendarId,
        title: (e.title ?? "").trim() || "(no title)",
        start: new Date(e.startDate).toISOString(),
        end: new Date(e.endDate).toISOString(),
        allDay: !!e.allDay,
        ...(ref ? { mine: true, ref } : {}),
        ...(e.location ? { location: e.location } : {}),
        ...(names.get(e.calendarId) ? { calendar: names.get(e.calendarId) } : {}),
      } satisfies CalEvent;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The next `days` days, from the start of today. */
export async function readWeek(now = new Date(), days = 14): Promise<CalEvent[]> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + days * 864e5);
  return readEvents(start, end);
}

async function preferredCalendarId(): Promise<string | null> {
  const db = await prefs();
  const saved = await db.getFirstAsync<{ value: string }>("SELECT value FROM preferences WHERE key=?", "calendar");
  const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter((c) => c.allowsModifications);
  if (saved && calendars.some((c) => c.id === saved.value)) return saved.value;
  const fallback = (await Calendar.getDefaultCalendarAsync().catch(() => null)) ?? calendars[0];
  return fallback?.allowsModifications ? fallback.id : (calendars[0]?.id ?? null);
}

export type PlanEventInput = { ref: string; title: string; start: Date; end: Date; allDay?: boolean; alarmMinutes?: number | null; notes?: string; location?: string };

/** Create or update Flow's event for `ref`. Returns the event id, or null when the calendar is not writable. */
export async function writePlanEvent(input: PlanEventInput, existingId?: string): Promise<string | null> {
  if (!(await calendarConnected())) return null;
  const notes = [input.notes?.trim(), `${FLOW_REF} ${input.ref}`].filter(Boolean).join("\n\n");
  const details = {
    title: input.title,
    startDate: input.start,
    endDate: input.end,
    allDay: !!input.allDay,
    notes,
    location: input.location ?? "",
    alarms: input.alarmMinutes === null || input.alarmMinutes === undefined ? [] : [{ relativeOffset: -input.alarmMinutes }],
  };
  if (existingId) {
    try {
      await Calendar.updateEventAsync(existingId, details);
      return existingId;
    } catch {
      /* deleted by the person: write a fresh one */
    }
  }
  const calendarId = await preferredCalendarId();
  if (!calendarId) return null;
  try {
    return await Calendar.createEventAsync(calendarId, details);
  } catch {
    return null;
  }
}

export async function deletePlanEvent(id: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(id);
  } catch {
    /* already gone */
  }
}

/** A chase or a dateless move in Apple Reminders ("Flow" list); falls back to an all-day event when Reminders is off. */
export async function writeReminder(input: { ref: string; title: string; due: Date; notes?: string }, existingId?: string): Promise<{ id: string; via: "reminders" | "calendar" } | null> {
  if (await remindersConnected()) {
    try {
      const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
      let list = lists.find((l) => l.title === "Flow") ?? lists.find((l) => l.allowsModifications);
      if (!list) return null;
      if (list.title !== "Flow") {
        try {
          const source = list.source;
          const id = await Calendar.createCalendarAsync({ title: "Flow", entityType: Calendar.EntityTypes.REMINDER, sourceId: source?.id, source, color: "#345BEE", name: "Flow" });
          list = { ...list, id, title: "Flow" };
        } catch {
          /* keep the writable list */
        }
      }
      const details = { title: input.title, dueDate: input.due, startDate: input.due, notes: `${input.notes ?? ""}\n\n${FLOW_REF} ${input.ref}`.trim(), alarms: [{ absoluteDate: input.due.toISOString() }] };
      if (existingId) {
        try {
          await Calendar.updateReminderAsync(existingId, details);
          return { id: existingId, via: "reminders" };
        } catch {
          /* gone */
        }
      }
      const id = await Calendar.createReminderAsync(list.id, details);
      return { id, via: "reminders" };
    } catch {
      /* fall through to the calendar */
    }
  }
  const dayStart = new Date(input.due.getFullYear(), input.due.getMonth(), input.due.getDate());
  const id = await writePlanEvent({ ref: input.ref, title: input.title, start: dayStart, end: new Date(dayStart.getTime() + 864e5), allDay: true, alarmMinutes: -9 * 60, notes: input.notes }, existingId);
  return id ? { id, via: "calendar" } : null;
}

/** Dev only: put a believable week on the simulator's empty calendar. */
export async function seedDemoCalendar(now = new Date()): Promise<number> {
  const calendarId = await preferredCalendarId();
  if (!calendarId) return 0;
  const at = (day: number, h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m);
  const items: { title: string; day: number; h?: number; len?: number; allDay?: boolean }[] = [
    { title: "Team sync", day: 0, h: 15, len: 45 },
    { title: "Court hearing", day: 1, h: 10, len: 90 },
    { title: "Dinner with Sam", day: 1, h: 19, len: 120 },
    { title: "Dentist", day: 2, h: 9, len: 60 },
    { title: "Flight to NYC", day: 3, allDay: true },
    { title: "Client workshop", day: 3, h: 11, len: 180 },
    { title: "Flight back", day: 4, allDay: true },
    { title: "Mum's birthday", day: 5, allDay: true },
  ];
  let n = 0;
  for (const i of items) {
    const start = i.allDay ? at(i.day, 0) : at(i.day, i.h!);
    const end = i.allDay ? at(i.day + 1, 0) : new Date(start.getTime() + (i.len ?? 60) * 60000);
    try {
      await Calendar.createEventAsync(calendarId, { title: i.title, startDate: start, endDate: end, allDay: !!i.allDay, notes: "demo" });
      n++;
    } catch {
      /* ignore */
    }
  }
  return n;
}

/** Mark Flow's reminder done (or remove its event) when the person ticks a move in Flow. */
export async function completeOnPhone(task: { eventId?: string; reminderId?: string; title: string }): Promise<void> {
  if (task.reminderId) {
    try {
      await Calendar.updateReminderAsync(task.reminderId, { completed: true, completionDate: new Date() });
    } catch {
      /* gone */
    }
  }
  if (task.eventId) {
    try {
      const e = await Calendar.getEventAsync(task.eventId);
      if (e?.id && !/^✓ /.test(e.title ?? "")) await Calendar.updateEventAsync(task.eventId, { title: `✓ ${e.title}` });
    } catch {
      /* gone */
    }
  }
}

export async function removeFromPhone(task: { eventId?: string; reminderId?: string }): Promise<void> {
  if (task.reminderId) {
    try {
      await Calendar.deleteReminderAsync(task.reminderId);
    } catch {
      /* gone */
    }
  }
  if (task.eventId) await deletePlanEvent(task.eventId);
}

/**
 * What the person did in Apple Reminders and Calendar since last time: the
 * ids of Flow reminders they ticked, and the ids of Flow events they deleted.
 */
export async function readBack(tasks: { id: string; eventId?: string; reminderId?: string; done: boolean }[]): Promise<{ completed: string[]; removed: string[] }> {
  const completed: string[] = [];
  const removed: string[] = [];
  if (Platform.OS !== "ios") return { completed, removed };
  if (await remindersConnected()) {
    for (const t of tasks) {
      if (!t.reminderId || t.done) continue;
      try {
        const r = await Calendar.getReminderAsync(t.reminderId);
        if (r?.completed) completed.push(t.id);
      } catch {
        /* deleted reminder: leave the task alone */
      }
    }
  }
  if (await calendarConnected()) {
    for (const t of tasks) {
      if (!t.eventId || t.done) continue;
      try {
        const e = await Calendar.getEventAsync(t.eventId);
        if (!e?.id) removed.push(t.id);
        else if (/^✓ /.test(e.title ?? "")) completed.push(t.id);
      } catch {
        removed.push(t.id);
      }
    }
  }
  return { completed: [...new Set(completed)], removed };
}

/** Everything Flow ever put on the phone: its events (a year around today) and its reminders. Used by "Delete everything". */
export async function removeAllFlowItems(now = new Date()): Promise<{ events: number; reminders: number }> {
  let events = 0, reminders = 0;
  if (await calendarConnected()) {
    try {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const from = new Date(now.getTime() - 60 * 864e5), to = new Date(now.getTime() + 400 * 864e5);
      const all = calendars.length ? await Calendar.getEventsAsync(calendars.map((c) => c.id), from, to) : [];
      for (const e of all) {
        if (!refOf(e.notes)) continue;
        await Calendar.deleteEventAsync(e.id).catch(() => {});
        events++;
      }
    } catch {
      /* best effort */
    }
  }
  if (await remindersConnected()) {
    try {
      const lists = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER)).filter((l) => l.title === "Flow");
      if (lists.length) {
        const all = await Calendar.getRemindersAsync(lists.map((l) => l.id), null, new Date(now.getTime() - 400 * 864e5), new Date(now.getTime() + 400 * 864e5));
        for (const r of all) {
          if (r.id && refOf(r.notes)) {
            await Calendar.deleteReminderAsync(r.id).catch(() => {});
            reminders++;
          }
        }
      }
    } catch {
      /* best effort */
    }
  }
  return { events, reminders };
}
