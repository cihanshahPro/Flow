import { AREAS, areaSelections, type Profile } from "./personality.ts";
import type { DirectionContext, Note, Task } from "./model.ts";
import { localDate } from "./model.ts";
import type { ThoughtDraft } from "./drafts.ts";
import { taskIsDue, taskState } from "./task-flow.ts";

export type DirectionOption = DirectionContext & { title: string };
export type JourneyNext = {
  kind:
    | "setup"
    | "process"
    | "draft"
    | "task"
    | "starter"
    | "check-in"
    | "follow-up"
    | "scheduled"
    | "paused"
    | "complete";
  direction?: DirectionContext;
  title: string;
  id?: string;
};
export type JourneyState = {
  next: JourneyNext;
  coverage: { answered: number; reviewed: number; deferred: number };
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
  today = localDate(),
): JourneyState {
  const options = directionOptions(profile);
  const focused = options.find((option) => option.title === profile.focus);
  const ordered = focused
    ? [focused, ...options.filter((option) => option !== focused)]
    : options;
  const coverage = {
    answered: profile.answers
      .slice(0, 20)
      .filter(
        (answer) => Number.isInteger(answer) && answer >= 1 && answer <= 5,
      ).length,
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
      (!note.captureKind || note.captureKind === "thought") &&
      (note.audioUri || note.text.trim()) &&
      !drafts.some(
        (draft) =>
          draft.id === note.id || draft.sourceNoteIds?.includes(note.id),
      ),
  );
  const newest = <T extends { createdAt: string }>(items: T[]): T | undefined =>
    [...items].sort((a, b) => timestamp(b) - timestamp(a))[0];
  const sameDirection = (
    item: { direction?: DirectionContext },
    direction: DirectionContext,
  ) => item.direction?.directionId === direction.directionId;
  const nextForTask = (
    task: Task,
    kind: "task" | "check-in" | "follow-up" | "scheduled",
  ): JourneyNext => ({
    kind,
    id: task.id,
    title: task.title,
    ...(task.direction ? { direction: task.direction } : {}),
  });
  // Due work comes first, then steps that fit the saved time preference.
  // Stable ordering prevents new captures from repeatedly replacing older work.
  const readyRank = (task: Task) =>
    task.deadline && task.deadline <= today
      ? 0
      : task.plannedDate && task.plannedDate <= today
        ? 1
        : 2;
  const preferredMinutes =
    typeof profile.preferredMinutes === "number"
      ? profile.preferredMinutes
      : 10;
  const timeFit = (task: Task) => Number(task.minutes > preferredMinutes);
  const byReadyPriority = (a: Task, b: Task) =>
    readyRank(a) - readyRank(b) ||
    timeFit(a) - timeFit(b) ||
    (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
    (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999") ||
    timestamp(a) - timestamp(b) ||
    a.id.localeCompare(b.id);
  const readyTasks = realTasks
    .filter((task) => taskState(task, today) === "ready")
    .sort(byReadyPriority);
  const focusRank = (task: Task) =>
    focused && sameDirection(task, focused) ? 0 : 1;
  const checkIn = realTasks
    .filter((task) => taskState(task, today) === "check-in")
    .sort(
      (a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? "") ||
        a.id.localeCompare(b.id),
    )[0];
  const dueFollowUp = realTasks
    .filter((task) => {
      const state = taskState(task, today);
      return (
        (state === "waiting" || state === "blocked") && taskIsDue(task, today)
      );
    })
    .sort(
      (a, b) =>
        a.chaseDate.localeCompare(b.chaseDate) ||
        focusRank(a) - focusRank(b) ||
        byReadyPriority(a, b),
    )[0];
  const activeTask = realTasks.find((task) => task.id === profile.activeTaskId);
  function pending(direction: DirectionContext): JourneyNext | undefined {
    const task = readyTasks.find((item) => sameDirection(item, direction));
    if (task) return nextForTask(task, "task");
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

  // Finish the current conversation before switching plans. A check-in means
  // one action ended, not that its interest or larger goal has been achieved.
  let next: JourneyNext | undefined = checkIn
    ? nextForTask(checkIn, "check-in")
    : dueFollowUp
      ? nextForTask(dueFollowUp, "follow-up")
      : undefined;
  if (!next && activeTask) {
    if (activeTask.done && activeTask.reviewedAt)
      next = {
        ...nextForTask(activeTask, "task"),
        kind: "paused",
        title: "A good place to pause",
      };
    else if (taskState(activeTask, today) === "ready")
      next = nextForTask(activeTask, "task");
  }
  if (!next && focused && profile.focusExplicit === true) {
    next = pending(focused);
    if (
      !next &&
      (!activeTask || activeTask.done) &&
      !realTasks.some((task) => sameDirection(task, focused))
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
      ...readyTasks
        .filter(outsideSelected)
        .slice(0, 1)
        .map((task) => ({
          createdAt: task.createdAt,
          next: {
            kind: "task" as const,
            title: "Continue your saved action",
            id: task.id,
            ...(task.direction ? { direction: task.direction } : {}),
          },
        })),
      ...actionableDrafts.filter(outsideSelected).map((draft) => ({
        createdAt: draft.createdAt,
        next: {
          kind: "draft" as const,
          title: "Continue your saved draft",
          id: draft.id,
          ...(draft.direction ? { direction: draft.direction } : {}),
        },
      })),
      ...unprocessedNotes.filter(outsideSelected).map((note) => ({
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
    const held = realTasks
      .filter((task) => {
        const state = taskState(task, today);
        return state === "later" || state === "waiting" || state === "blocked";
      })
      .sort(
        (a, b) =>
          Number(b.id === activeTask?.id) - Number(a.id === activeTask?.id) ||
          focusRank(a) - focusRank(b) ||
          (a.chaseDate || a.plannedDate || "9999").localeCompare(
            b.chaseDate || b.plannedDate || "9999",
          ) ||
          timestamp(a) - timestamp(b) ||
          a.id.localeCompare(b.id),
      )[0];
    if (held) next = nextForTask(held, "scheduled");
  }
  if (!next) {
    const unfinished = ordered.find(
      (direction) => !realTasks.some((task) => sameDirection(task, direction)),
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
        title: ordered.length
          ? "Your saved steps are finished"
          : "Room for whatever comes next",
      };
    else next = { kind: "setup", title: "Continue setting up your life map" };
  }

  const mapped = coverage.reviewed === AREAS.length;
  const ready = realTasks.length > 0;
  const done = realTasks.some((task) => task.done);
  return {
    next,
    coverage,
    milestones: [
      {
        label: "Personality assessment completed",
        done: coverage.answered === 20,
      },
      { label: "Life areas reviewed", done: mapped },
      { label: "First action chosen", done: ready },
      { label: "First action completed", done },
    ],
  };
}
