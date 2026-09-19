import type { ThoughtDraft } from "./drafts.ts";
import type { Task } from "./model.ts";
import type { Profile } from "./personality.ts";
import { profileCompletion } from "./profile-completion.ts";

export type ProgressRecord = {
  version: 1;
  unlockedAt?: string;
  completedTaskIds: string[];
};

export type ProgressLevel = { number: number; title: string };
export type ProgressMilestone = ProgressLevel & {
  threshold: number;
  reached: boolean;
};
export type ProgressSummary = {
  unlocked: boolean;
  level: ProgressLevel | null;
  completedCount: number;
  next: (ProgressLevel & { threshold: number; remaining: number }) | null;
  milestones: ProgressMilestone[];
};

const milestones = [
  { number: 1, title: "Ready", threshold: 0 },
  { number: 2, title: "First win", threshold: 1 },
  { number: 3, title: "Building momentum", threshold: 3 },
  { number: 4, title: "Following through", threshold: 7 },
  { number: 5, title: "Steady progress", threshold: 15 },
];

export function newProgress(): ProgressRecord {
  return { version: 1, completedTaskIds: [] };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

// Awards are a ledger of completed actions, separate from mutable task state.
// Existing completed work is recognized only when the saved profile reaches 100%.
export function reconcileProgress(
  previous: ProgressRecord | null | undefined,
  profile: Profile,
  tasks: Task[],
  drafts: ThoughtDraft[],
  now = new Date().toISOString(),
): ProgressRecord {
  const unlockedAt =
    previous?.unlockedAt ||
    (profileCompletion(profile).percent === 100 ? now : undefined);
  if (!unlockedAt) return newProgress();

  const examplePrefixes = drafts
    .filter((draft) => draft.example === true)
    .map((draft) => `flow:${draft.id}:`);
  // "example" was also used as a fixed draft ID in development fixtures.
  examplePrefixes.push("flow:example:");
  const earned = uniqueIds(previous?.completedTaskIds ?? []);
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
  return { version: 1, unlockedAt, completedTaskIds: earned };
}

export function levelForProgress(progress: ProgressRecord): ProgressSummary {
  const unlocked = Boolean(progress.unlockedAt);
  const completedCount = unlocked
    ? uniqueIds(progress.completedTaskIds).length
    : 0;
  if (!unlocked) {
    return {
      unlocked: false,
      level: null,
      completedCount: 0,
      next: null,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        reached: false,
      })),
    };
  }
  const current =
    completedCount >= 15
      ? {
          number: 5 + Math.floor((completedCount - 15) / 10),
          title:
            completedCount < 25
              ? "Steady progress"
              : `Level ${5 + Math.floor((completedCount - 15) / 10)}`,
          threshold: 15 + Math.floor((completedCount - 15) / 10) * 10,
        }
      : [...milestones]
          .reverse()
          .find((milestone) => completedCount >= milestone.threshold)!;
  const next = milestones.find(
    (milestone) => milestone.number === current.number + 1,
  ) ?? {
    number: current.number + 1,
    title: `Level ${current.number + 1}`,
    threshold: current.threshold + 10,
  };
  return {
    unlocked: true,
    level: { number: current.number, title: current.title },
    completedCount,
    next: { ...next, remaining: next.threshold - completedCount },
    milestones: milestones.map((milestone) => ({
      ...milestone,
      reached: completedCount >= milestone.threshold,
    })),
  };
}
