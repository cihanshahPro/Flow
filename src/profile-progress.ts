import { ITEMS, type Profile } from "./personality.ts";
import type { ThoughtDraft } from "./drafts.ts";

/**
 * How complete the person's profile is, as one number people recognise.
 * Weights: the personality test is worth 40, the five plate questions 10
 * each, and the first thread 10. Nothing here blocks recording.
 */
export type ProfileProgress = {
  percent: number;
  parts: { id: "test" | "areas" | "people" | "timeWindow" | "obstacles" | "datedSoon" | "firstThread"; label: string; done: boolean; weight: number }[];
  next: string | null;
};

export function profileProgress(profile: Profile, threads: ThoughtDraft[] = []): ProfileProgress {
  const answers = Array.isArray(profile.answers) ? profile.answers : [];
  const testDone = answers.length === ITEMS.length && answers.every((a) => Number.isInteger(a) && a >= 1 && a <= 5);
  const plate = profile.plate;
  const parts: ProfileProgress["parts"] = [
    { id: "test", label: "Personality test", done: testDone, weight: 40 },
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
