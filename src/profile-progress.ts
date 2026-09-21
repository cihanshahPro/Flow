import type { Profile } from "./personality.ts";
import type { ThoughtDraft } from "./drafts.ts";

/**
 * How complete the person's profile is, as one number people recognise.
 * Weights: the calendar connected 40, the first recording 10, the five
 * plate questions 10 each. Nothing here blocks recording.
 */
export type ProfileProgress = {
  percent: number;
  parts: { id: "calendar" | "areas" | "people" | "timeWindow" | "obstacles" | "datedSoon" | "firstThread"; label: string; done: boolean; weight: number }[];
  next: string | null;
};

export function profileProgress(profile: Profile, threads: ThoughtDraft[] = [], calendarConnected = false): ProfileProgress {
  const plate = profile.plate;
  const parts: ProfileProgress["parts"] = [
    { id: "calendar", label: "Calendar connected", done: calendarConnected, weight: 40 },
    { id: "areas", label: "What's on your plate", done: (plate?.areas?.length ?? 0) > 0, weight: 10 },
    { id: "people", label: "Who's in the picture", done: (plate?.people?.length ?? 0) > 0, weight: 10 },
    { id: "timeWindow", label: "When you get time", done: !!plate?.timeWindow, weight: 10 },
    { id: "obstacles", label: "What gets in the way", done: (plate?.obstacles?.length ?? 0) > 0, weight: 10 },
    { id: "datedSoon", label: "Anything dated", done: !!plate?.datedSoon, weight: 10 },
    { id: "firstThread", label: "First thread", done: threads.some((t) => !t.example && (t.messages ?? []).length > 0), weight: 10 },
  ];
  const percent = parts.reduce((sum, p) => sum + (p.done ? p.weight : 0), 0);
  const next = parts.find((p) => !p.done)?.label ?? null;
  return { percent, parts, next };
}
