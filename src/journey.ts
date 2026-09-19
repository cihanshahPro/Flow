import { AREAS, areaSelections, type Profile } from "./personality.ts";
import type { DirectionContext, Note, Task } from "./model.ts";
import type { ThoughtDraft } from "./drafts.ts";

export type DirectionOption = DirectionContext & { title: string };
export type JourneyNext = {
  kind: "setup" | "process" | "draft" | "task" | "starter" | "complete";
  direction?: DirectionContext;
  title: string;
  id?: string;
};
export type JourneyState = {
  next: JourneyNext;
  coverage: { answered: number; reviewed: number; deferred: number };
  level: { number: number; title: string };
  milestones: Array<{ label: string; done: boolean }>;
};

export function directionOptions(profile: Profile): DirectionOption[] {
  return AREAS.flatMap((area) =>
    areaSelections(profile.areas[area.id]).map((choice) => ({
      directionId: `${area.id}:${choice}`,
      areaId: area.id,
      choice,
      title: `${area.title}: ${choice}`,
    })),
  );
}

function timestamp(value: { createdAt: string }): number {
  const parsed = Date.parse(value.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Derive the next screen from saved work, never from the old survey-complete flag.
export function journeyState(
  profile: Profile,
  notes: Note[],
  drafts: ThoughtDraft[],
  tasks: Task[],
): JourneyState {
  const options = directionOptions(profile);
  const focused = options.find((option) => option.title === profile.focus);
  const ordered = focused
    ? [focused, ...options.filter((option) => option !== focused)]
    : options;
  const coverage = {
    answered: profile.answers
      .slice(0, 20)
      .filter((answer) => Number.isInteger(answer) && answer >= 1 && answer <= 5)
      .length,
    reviewed: 0,
    deferred: 0,
  };
  for (const area of AREAS) {
    const value = profile.areas[area.id];
    if (value === "Later") coverage.deferred += 1;
    else if (
      (Array.isArray(value) && value.length > 0) ||
      (typeof value === "string" && value.trim().length > 0)
    )
      coverage.reviewed += 1;
  }

  const examples = drafts.filter((draft) => draft.example);
  const realTasks = tasks.filter(
    (task) =>
      !examples.some((example) => task.id.startsWith(`flow:${example.id}:`)),
  );
  const actionableDrafts = drafts.filter(
    (draft) =>
      !draft.example &&
      draft.state !== "parked" &&
      draft.steps.some((step) => !step.accepted && !step.deferred),
  );
  const unprocessedNotes = notes.filter(
    (note) =>
      (note.audioUri || note.text.trim()) &&
      !drafts.some((draft) => draft.id === note.id),
  );
  const newest = <T extends { createdAt: string }>(items: T[]): T | undefined =>
    [...items].sort((a, b) => timestamp(b) - timestamp(a))[0];
  const sameDirection = (
    item: { direction?: DirectionContext },
    direction: DirectionContext,
  ) => item.direction?.directionId === direction.directionId;
  function pending(direction: DirectionContext): JourneyNext | undefined {
    const task = newest(
      realTasks.filter((item) => !item.done && sameDirection(item, direction)),
    );
    if (task) return { kind: "task", direction, title: task.title, id: task.id };
    const draft = newest(
      actionableDrafts.filter((item) => sameDirection(item, direction)),
    );
    if (draft)
      return { kind: "draft", direction, title: draft.title, id: draft.id };
    const note = newest(
      unprocessedNotes.filter((item) => sameDirection(item, direction)),
    );
    if (note)
      return {
        kind: "process",
        direction,
        title: "Continue your saved thought",
        id: note.id,
      };
  }

  let next: JourneyNext | undefined;
  if (focused && profile.focusExplicit === true) {
    next = pending(focused);
    if (
      !next &&
      !realTasks.some((task) => task.done && sameDirection(task, focused))
    )
      next = { kind: "starter", direction: focused, title: focused.choice };
  }
  if (!next) {
    for (const direction of ordered) {
      next = pending(direction);
      if (next) break;
    }
  }
  if (!next) {
    // Removing an interest never discards its saved work. Older unlinked work
    // stays unlinked; previously linked work keeps its original direction.
    const selectedIds = new Set(options.map((option) => option.directionId));
    const outsideSelected = (item: { direction?: DirectionContext }) =>
      !item.direction || !selectedIds.has(item.direction.directionId);
    const remaining: Array<{ next: JourneyNext; createdAt: string }> = [
      ...realTasks
        .filter((task) => outsideSelected(task) && !task.done)
        .map((task) => ({
          createdAt: task.createdAt,
          next: {
            kind: "task" as const,
            title: "Continue your saved action",
            id: task.id,
            ...(task.direction ? { direction: task.direction } : {}),
          },
        })),
      ...actionableDrafts
        .filter(outsideSelected)
        .map((draft) => ({
          createdAt: draft.createdAt,
          next: {
            kind: "draft" as const,
            title: "Continue your saved draft",
            id: draft.id,
            ...(draft.direction ? { direction: draft.direction } : {}),
          },
        })),
      ...unprocessedNotes
        .filter(outsideSelected)
        .map((note) => ({
          createdAt: note.createdAt,
          next: {
            kind: "process" as const,
            title: "Continue your saved thought",
            id: note.id,
            ...(note.direction ? { direction: note.direction } : {}),
          },
        })),
    ];
    next = newest(remaining)?.next;
  }
  if (!next) {
    const unfinished = ordered.find(
      (direction) =>
        !realTasks.some((task) => task.done && sameDirection(task, direction)),
    );
    if (unfinished)
      next = {
        kind: "starter",
        direction: unfinished,
        title: unfinished.choice,
      };
    else if (ordered.length || coverage.reviewed === AREAS.length)
      next = {
        kind: "complete",
        title: ordered.length ? "Your next step is complete" : "Your life map is ready",
      };
    else next = { kind: "setup", title: "Continue setting up your life map" };
  }

  const mapped = coverage.reviewed === AREAS.length;
  const ready = realTasks.length > 0;
  const done = realTasks.some((task) => task.done);
  return {
    next,
    coverage,
    level: done
      ? { number: 4, title: "In motion" }
      : ready
        ? { number: 3, title: "Ready to act" }
        : mapped
          ? { number: 2, title: "Mapped" }
          : { number: 1, title: "Getting acquainted" },
    milestones: [
      { label: "Personality assessment completed", done: coverage.answered === 20 },
      { label: "Life areas reviewed", done: mapped },
      { label: "First action chosen", done: ready },
      { label: "First action completed", done },
    ],
  };
}
