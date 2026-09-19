import type { ThoughtDraft } from "./drafts.ts";
import type { Task } from "./model.ts";
import { ITEMS, type Profile } from "./personality.ts";
import { profileCompletion } from "./profile-completion.ts";
import { isReady } from "./thread.ts";

/**
 * The level ledger. Version stays 1 on disk; the thread and check-in arrays
 * are additive so an older record still reads and nothing earned is lost.
 */
export type ProgressRecord = {
  version: 1;
  unlockedAt?: string;
  completedTaskIds: string[];
  understoodThreadIds?: string[];
  checkInIds?: string[];
};

export type ProgressLevel = { number: number; title: string };
export type ProgressMilestone = ProgressLevel & {
  threshold: number;
  reached: boolean;
};
export type ProgressSummary = {
  unlocked: boolean;
  level: ProgressLevel | null;
  /** Everything that counts: moves done, threads understood, check-ins confirmed. */
  completedCount: number;
  movesDone: number;
  threadsUnderstood: number;
  checkIns: number;
  next: (ProgressLevel & { threshold: number; remaining: number }) | null;
  milestones: ProgressMilestone[];
};

// Small and encouraging. No streaks, no penalties, no currency.
const milestones = [
  { number: 1, title: "Starting point", threshold: 0 },
  { number: 2, title: "Building", threshold: 1 },
  { number: 3, title: "Momentum", threshold: 3 },
  { number: 4, title: "Follow-through", threshold: 7 },
  { number: 5, title: "Mastery", threshold: 15 },
];

export function newProgress(): ProgressRecord {
  return { version: 1, completedTaskIds: [] };
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => typeof id === "string" && id.trim()))];
}

function assessmentComplete(profile: Profile): boolean {
  const answers = Array.isArray(profile.answers) ? profile.answers : [];
  return (
    answers.length === ITEMS.length &&
    answers.every((a) => Number.isInteger(a) && a >= 1 && a <= 5)
  );
}

// Awards are a ledger of real things, separate from mutable task state.
// Levels unlock once the person has finished the quiz; edits never take a
// level away. Recording alone earns nothing.
export function reconcileProgress(
  previous: ProgressRecord | null | undefined,
  profile: Profile,
  tasks: Task[],
  drafts: ThoughtDraft[],
  now = new Date().toISOString(),
): ProgressRecord {
  const unlockedAt =
    previous?.unlockedAt ||
    (assessmentComplete(profile) || profileCompletion(profile).percent === 100
      ? now
      : undefined);
  if (!unlockedAt) return newProgress();

  const examplePrefixes = drafts
    .filter((draft) => draft.example === true)
    .map((draft) => `flow:${draft.id}:`);
  // "example" was also used as a fixed draft ID in development fixtures.
  examplePrefixes.push("flow:example:");
  const earned = uniqueIds(previous?.completedTaskIds);
  const seen = new Set(earned);
  for (const task of tasks) {
    if (
      task.done !== true ||
      !task.id?.trim() ||
      seen.has(task.id) ||
      examplePrefixes.some((prefix) => task.id.startsWith(prefix))
    )
      continue;
    earned.push(task.id);
    seen.add(task.id);
  }
  const threads = uniqueIds(previous?.understoodThreadIds);
  const seenThreads = new Set(threads);
  const checkIns = uniqueIds(previous?.checkInIds);
  const seenChecks = new Set(checkIns);
  for (const draft of drafts) {
    if (draft.example) continue;
    if (!seenThreads.has(draft.id) && isReady(draft.threadPoints)) {
      threads.push(draft.id);
      seenThreads.add(draft.id);
    }
    for (const m of draft.messages ?? []) {
      if (m.kind === "checkin" && m.answered === "yes" && !m.taskId && !seenChecks.has(m.id)) {
        checkIns.push(m.id);
        seenChecks.add(m.id);
      }
    }
  }
  const record: ProgressRecord = { version: 1, unlockedAt, completedTaskIds: earned };
  if (threads.length || previous?.understoodThreadIds) record.understoodThreadIds = threads;
  if (checkIns.length || previous?.checkInIds) record.checkInIds = checkIns;
  return record;
}

export function levelForProgress(progress: ProgressRecord): ProgressSummary {
  const unlocked = Boolean(progress.unlockedAt);
  const movesDone = unlocked ? uniqueIds(progress.completedTaskIds).length : 0;
  const threadsUnderstood = unlocked ? uniqueIds(progress.understoodThreadIds).length : 0;
  const checkIns = unlocked ? uniqueIds(progress.checkInIds).length : 0;
  const completedCount = movesDone + threadsUnderstood + checkIns;
  if (!unlocked) {
    return {
      unlocked: false,
      level: null,
      completedCount: 0,
      movesDone: 0,
      threadsUnderstood: 0,
      checkIns: 0,
      next: null,
      milestones: milestones.map((milestone) => ({ ...milestone, reached: false })),
    };
  }
  const current =
    completedCount >= 15
      ? {
          number: 5 + Math.floor((completedCount - 15) / 10),
          title:
            completedCount < 25
              ? "Mastery"
              : `Mastery ${["II", "III", "IV", "V"][Math.min(3, Math.floor((completedCount - 25) / 10))]}`,
          threshold: 15 + Math.floor((completedCount - 15) / 10) * 10,
        }
      : [...milestones].reverse().find((milestone) => completedCount >= milestone.threshold)!;
  const next = milestones.find((milestone) => milestone.number === current.number + 1) ?? {
    number: current.number + 1,
    title: `Mastery ${["II", "III", "IV", "V"][Math.min(3, current.number - 5)]}`,
    threshold: current.threshold + 10,
  };
  return {
    unlocked: true,
    level: { number: current.number, title: current.title },
    completedCount,
    movesDone,
    threadsUnderstood,
    checkIns,
    next: { ...next, remaining: next.threshold - completedCount },
    milestones: milestones.map((milestone) => ({
      ...milestone,
      reached: completedCount >= milestone.threshold,
    })),
  };
}
