import { localDate } from "./model.ts";

/** A concrete moment for a move: local date, "HH:MM" time and the words shown on the offer. */
export type When = { date: string; time: string; label: string };

const PARTS = { morning: 9, lunch: 12, afternoon: 14, evening: 19 } as const;
type Part = keyof typeof PARTS;

const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;
const addDays = (now: Date, n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);

function partOf(t: string): Part | undefined {
  if (/\bmorning\b|first thing/.test(t)) return "morning";
  if (/\blunch/.test(t)) return "lunch";
  if (/\bafternoon\b/.test(t)) return "afternoon";
  if (/\bevening\b|\btonight\b|\bnight\b/.test(t)) return "evening";
  return undefined;
}

/** The next full hour today, or tomorrow 09:00 when the day is nearly over. */
function soon(now: Date): When {
  const h = now.getHours() + 1;
  if (h >= 22) return { date: localDate(addDays(now, 1)), time: hhmm(PARTS.morning), label: "Tomorrow morning" };
  return { date: localDate(now), time: hhmm(Math.max(h, 7)), label: "Today" };
}

/**
 * Turns a spoken or tapped time ("Tomorrow morning", "This evening", "This weekend",
 * "Next free 15 minutes") into a real local date and time: morning 09:00, lunch 12:00,
 * afternoon 14:00, evening 19:00. Returns undefined when the words hold no moment.
 */
export function whenFromAnswer(text: string | undefined, now = new Date()): When | undefined {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return undefined;
  const part = partOf(t);
  if (/\btomorrow\b/.test(t)) {
    const p = part ?? "morning";
    return { date: localDate(addDays(now, 1)), time: hhmm(PARTS[p]), label: part ? `Tomorrow ${p === "lunch" ? "at lunch" : p}` : "Tomorrow" };
  }
  if (/\bweekend\b/.test(t)) {
    const day = now.getDay();
    if (day === 6 || day === 0) return soon(now);
    return { date: localDate(addDays(now, 6 - day)), time: hhmm(PARTS[part ?? "morning"]), label: "This weekend" };
  }
  if (part) {
    const h = PARTS[part];
    const label = part === "lunch" ? "At lunch" : part === "evening" && /tonight/.test(t) ? "Tonight" : `This ${part}`;
    if (now.getHours() < h) return { date: localDate(now), time: hhmm(h), label: label === "At lunch" ? "At lunch today" : label };
    return { date: localDate(addDays(now, 1)), time: hhmm(h), label: part === "lunch" ? "At lunch tomorrow" : `Tomorrow ${part}` };
  }
  if (/\btoday\b|\bnow\b|next free|\bminutes?\b|asap/.test(t)) return soon(now);
  return undefined;
}
