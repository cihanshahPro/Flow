import { localDate } from "./model.ts";

/**
 * The calendar as Flow reads it: what is already in the person's week, what
 * to watch out for, and where the gaps are. Pure; the device read/write is
 * in services/calendar-read.ts. Google calendars added to the phone come
 * through the same iOS read.
 */

export type CalEvent = {
  id: string;
  calendarId: string;
  title: string;
  /** ISO instants. */
  start: string;
  end: string;
  allDay: boolean;
  /** Written by Flow (notes carry the Flow reference). */
  mine?: boolean;
  /** Flow's item this event belongs to, when mine. */
  ref?: string;
  location?: string;
};

export const FLOW_REF = "Flowthread:";

export function refOf(notes: string | undefined | null): string | undefined {
  const m = (notes ?? "").match(/Flowthread:\s*(\S+)/);
  return m?.[1];
}

export const WORK_HOURS = { start: 9, end: 18 };
export const SLOT_MINUTES = 20;

export function dayOf(iso: string): string {
  return localDate(new Date(iso));
}

/** Seven days starting today, as YYYY-MM-DD. */
export function weekDays(now = new Date(), count = 7): string[] {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: count }, (_, i) => localDate(new Date(base.getTime() + i * 864e5)));
}

export function eventsOn(events: CalEvent[], date: string): CalEvent[] {
  return events
    .filter((e) => {
      const s = dayOf(e.start), en = dayOf(new Date(new Date(e.end).getTime() - 1).toISOString());
      return s <= date && date <= (e.allDay ? en : en < s ? s : en);
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

/** Minutes of timed events on a day (overlaps merged). */
export function busyMinutes(events: CalEvent[], date: string): number {
  const spans = eventsOn(events, date)
    .filter((e) => !e.allDay)
    .map((e) => [new Date(e.start).getTime(), new Date(e.end).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let total = 0, cursor = -Infinity;
  for (const [s, e] of spans) {
    const start = Math.max(s, cursor);
    if (e > start) total += (e - start) / 60000;
    cursor = Math.max(cursor, e);
  }
  return Math.round(total);
}

export type FreeSlot = { date: string; start: string; end: string; minutes: number };

/** Gaps of at least `minMinutes` inside working hours on a day, after `now`. */
export function freeSlots(events: CalEvent[], date: string, now = new Date(), minMinutes = SLOT_MINUTES): FreeSlot[] {
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, WORK_HOURS.start, 0, 0).getTime();
  const dayEnd = new Date(y, m - 1, d, WORK_HOURS.end, 0, 0).getTime();
  const from = Math.max(dayStart, date === localDate(now) ? Math.ceil(now.getTime() / 900000) * 900000 : dayStart);
  const busy = eventsOn(events, date)
    .filter((e) => !e.allDay)
    .map((e) => [new Date(e.start).getTime(), new Date(e.end).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: FreeSlot[] = [];
  let cursor = from;
  const push = (s: number, e: number) => {
    const minutes = Math.floor((e - s) / 60000);
    if (minutes >= minMinutes) out.push({ date, start: new Date(s).toISOString(), end: new Date(e).toISOString(), minutes });
  };
  for (const [s, e] of busy) {
    if (e <= cursor) continue;
    if (s > cursor) push(cursor, Math.min(s, dayEnd));
    cursor = Math.max(cursor, e);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) push(cursor, dayEnd);
  return out;
}

/** True when the day is a trip or has no room to add anything. */
export function dayIsFull(events: CalEvent[], date: string): boolean {
  const on = eventsOn(events, date);
  if (on.some((e) => e.allDay && TRAVEL.test(e.title))) return true;
  return busyMinutes(events, date) >= 360 || on.filter((e) => !e.allDay).length >= 5;
}

const IMPORTANT = /\b(court|hearing|trial|judge|lawyer|attorney|deadline|due|interview|exam|test|surgery|doctor|dentist|hospital|clinic|appointment|visa|embassy|immigration|passport|tax|irs|audit|closing|move|moving|flight|✈|wedding|funeral|presentation|demo|pitch|launch|deploy|review)\b/i;
const TRAVEL = /\b(flight|✈|trip|travel|fly|airport|nyc|london|paris|vacation|holiday|out of office|ooo)\b/i;
const OCCASION = /\b(birthday|bday|anniversary|wedding|graduation|christmas|eid|thanksgiving|mother'?s day|father'?s day)\b/i;

export type WatchOut = { kind: "important" | "full" | "occasion" | "trip"; date: string; title: string; note: string; eventId?: string };

/**
 * What Flow flags from the calendar alone, before the person says anything:
 * important appointments soon, full days, trips, occasions with nothing planned.
 */
export function watchOuts(events: CalEvent[], now = new Date(), days = 7): WatchOut[] {
  const out: WatchOut[] = [];
  const week = weekDays(now, days);
  const today = week[0];
  const label = (date: string) => (date === today ? "today" : date === week[1] ? "tomorrow" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }));
  for (const date of week) {
    const on = eventsOn(events, date);
    for (const e of on) {
      if (e.mine) continue;
      if (TRAVEL.test(e.title) && e.allDay) {
        if (!out.some((w) => w.kind === "trip" && w.eventId === e.id)) out.push({ kind: "trip", date, title: e.title, note: `${label(date)} · you're away`, eventId: e.id });
        continue;
      }
      if (OCCASION.test(e.title)) {
        const planned = on.some((o) => o.id !== e.id && !o.allDay);
        if (!planned) out.push({ kind: "occasion", date, title: e.title, note: `${label(date)} · nothing planned yet`, eventId: e.id });
        continue;
      }
      if (IMPORTANT.test(e.title) && week.indexOf(date) <= 2) out.push({ kind: "important", date, title: e.title, note: `${label(date)}${e.allDay ? "" : " · " + timeLabel(e.start)}`, eventId: e.id });
    }
    if (dayIsFull(events, date) && !out.some((w) => w.date === date && (w.kind === "trip" || w.kind === "full")))
      out.push({ kind: "full", date, title: `${capitalise(label(date))} is full`, note: `${on.filter((e) => !e.allDay).length} things · no room` });
  }
  return out.slice(0, 6);
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const hh = h % 12 || 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The first gap that fits, from `fromDate` on, skipping full days and the
 * dates to avoid. Working hours only; the same day only if there is still room.
 */
/** Important appointments get an hour of quiet before them: nothing is placed right before court or a flight. */
export function withBuffers(events: CalEvent[]): CalEvent[] {
  return events.map((e) => (!e.allDay && !e.mine && IMPORTANT.test(e.title) ? { ...e, start: new Date(new Date(e.start).getTime() - 3600000).toISOString() } : e));
}

export function placeInGap(
  events: CalEvent[],
  fromDate: string,
  minutes: number,
  now = new Date(),
  avoid: Set<string> = new Set(),
  horizonDays = 10,
): FreeSlot | null {
  events = withBuffers(events);
  const [y, m, d] = fromDate.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  for (let i = 0; i < horizonDays; i++) {
    const date = localDate(new Date(base.getTime() + i * 864e5));
    if (avoid.has(date) || dayIsFull(events, date)) continue;
    const day = new Date(`${date}T12:00:00`).getDay();
    if (day === 0 || day === 6) continue; // weekends stay the person's own
    const slot = freeSlots(events, date, now, minutes)[0];
    if (slot) return { ...slot, end: new Date(new Date(slot.start).getTime() + minutes * 60000).toISOString(), minutes };
  }
  return null;
}

/** Next working day at or after `date` that is not full or away. */
export function nextOpenDay(events: CalEvent[], date: string, avoid: Set<string> = new Set(), horizonDays = 14): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  for (let i = 0; i < horizonDays; i++) {
    const candidate = localDate(new Date(base.getTime() + i * 864e5));
    const day = new Date(`${candidate}T12:00:00`).getDay();
    if (day === 0 || day === 6 || avoid.has(candidate) || dayIsFull(events, candidate)) continue;
    return candidate;
  }
  return date;
}

/** Days the person is away, from all-day travel events. */
export function awayDays(events: CalEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (!(e.allDay && TRAVEL.test(e.title))) continue;
    let t = new Date(e.start).getTime();
    const end = new Date(e.end).getTime() - 1;
    while (t <= end) {
      out.add(localDate(new Date(t)));
      t += 864e5;
    }
  }
  return out;
}
