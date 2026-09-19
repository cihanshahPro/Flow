import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DirectionContext, Note, Task } from "../model.ts";
import { validDate } from "../model.ts";
import type { ThoughtDraft } from "../drafts.ts";
import { AREAS, type Profile } from "../personality.ts";
import { directionOptions } from "../journey.ts";
import { taskIsDue, taskState } from "../task-flow.ts";

type PlanNode = { draft: ThoughtDraft; tasks: Task[]; sources: Note[] };
type Branch = {
  key: string;
  direction?: DirectionContext;
  plans: PlanNode[];
  tasks: Task[];
  notes: Note[];
};

function dateLabel(value: string): string {
  if (!validDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(task: Task): string {
  const state = taskState(task);
  if (state === "done") return "Done";
  if (state === "check-in") return "Step done · Check-in needed";
  if (state === "waiting" || state === "blocked") {
    const who =
      state === "blocked"
        ? "Blocked"
        : task.waitingOn.trim()
          ? `Waiting on ${task.waitingOn.trim()}`
          : "Waiting";
    return task.chaseDate
      ? `${who} · ${taskIsDue(task) ? "Follow-up due" : "Check in"} ${dateLabel(task.chaseDate)}`
      : `${who} · No check-in date`;
  }
  if (state === "later")
    return task.plannedDate
      ? `For later · ${dateLabel(task.plannedDate)}${task.plannedTime ? ` at ${task.plannedTime}` : ""}`
      : "For later · No date chosen";
  return task.plannedDate
    ? `Planned ${dateLabel(task.plannedDate)}${task.plannedTime ? ` at ${task.plannedTime}` : ""}`
    : "Chosen step · No date set";
}

/** Exact step IDs preserve source ownership even when IDs themselves contain colons. */
function branchesFor(
  profile: Profile,
  notes: Note[],
  drafts: ThoughtDraft[],
  tasks: Task[],
): Branch[] {
  const branches = new Map<string, Branch>();
  const branchFor = (direction?: DirectionContext) => {
    const key = direction?.directionId ?? "__unlinked__";
    let branch = branches.get(key);
    if (!branch) {
      branch = { key, direction, plans: [], tasks: [], notes: [] };
      branches.set(key, branch);
    }
    return branch;
  };
  const choices = directionOptions(profile);
  const focus = choices.find((choice) => choice.title === profile.focus);
  for (const choice of focus
    ? [focus, ...choices.filter((choice) => choice !== focus)]
    : choices)
    branchFor(choice);

  const noteById = new Map(notes.map((note) => [note.id, note]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const ownedTasks = new Set<string>();
  const sourceNotes = new Set<string>();
  const seenDrafts = new Set<string>();
  for (const draft of drafts) {
    if (seenDrafts.has(draft.id)) continue;
    seenDrafts.add(draft.id);
    if (draft.example) {
      for (const step of draft.steps)
        ownedTasks.add(`flow:${draft.id}:${step.id}`);
      sourceNotes.add(draft.id);
      continue;
    }
    const linked: Task[] = [];
    for (const step of draft.steps) {
      const task = taskById.get(`flow:${draft.id}:${step.id}`);
      if (task && !ownedTasks.has(task.id)) {
        linked.push(task);
        ownedTasks.add(task.id);
      }
    }
    const original = noteById.get(draft.id);
    const sources = [
      ...(original ? [original] : []),
      ...[...noteById.values()].filter(
        (note) =>
          note.id !== draft.id &&
          (note.planId === draft.id || draft.sourceNoteIds?.includes(note.id)),
      ),
    ].filter((note) => !sourceNotes.has(note.id));
    for (const source of sources) sourceNotes.add(source.id);
    const direction =
      draft.direction ??
      sources.find((note) => note.direction)?.direction ??
      linked.find((task) => task.direction)?.direction;
    branchFor(direction).plans.push({ draft, tasks: linked, sources });
  }
  for (const task of taskById.values())
    if (!ownedTasks.has(task.id) && !task.id.startsWith("flow:example:"))
      branchFor(task.direction).tasks.push(task);
  for (const note of noteById.values())
    if (!sourceNotes.has(note.id)) branchFor(note.direction).notes.push(note);
  return [...branches.values()];
}

export default function PlanMap({
  profile,
  notes,
  drafts,
  tasks,
  currentTaskId,
  onOpenTask,
  onOpenDraft,
  onOpenNote,
  onCapture,
}: {
  profile: Profile;
  notes: Note[];
  drafts: ThoughtDraft[];
  tasks: Task[];
  currentTaskId?: string;
  onOpenTask: (task: Task) => void;
  onOpenDraft: (draft: ThoughtDraft) => void;
  onOpenNote: (note: Note) => void;
  onCapture: (direction?: DirectionContext) => void;
}) {
  const branches = branchesFor(profile, notes, drafts, tasks);
  const empty = branches.find(
    (branch) =>
      branch.direction &&
      !branch.plans.length &&
      !branch.tasks.length &&
      !branch.notes.length,
  );
  const hasWork = branches.some(
    (branch) =>
      branch.plans.length || branch.tasks.length || branch.notes.length,
  );
  const areas = [
    ...new Set(
      branches.map((branch) => branch.direction?.areaId ?? "__unlinked__"),
    ),
  ];
  const renderTask = (task: Task) => (
    <Pressable
      key={task.id}
      accessibilityRole="button"
      accessibilityLabel={`Open step: ${task.title}`}
      onPress={() => onOpenTask(task)}
      style={[s.task, task.id === currentTaskId && s.currentTask]}
    >
      <Text style={[s.taskIcon, task.done && s.done]}>
        {task.done ? "✓" : "○"}
      </Text>
      <View style={s.grow}>
        {task.id === currentTaskId && (
          <Text style={s.currentLabel}>YOUR CURRENT STEP</Text>
        )}
        <Text style={s.taskTitle}>{task.title}</Text>
        <Text style={s.meta}>
          {statusLabel(task)} · {task.minutes} min
          {task.deadline && !task.done
            ? ` · Due ${dateLabel(task.deadline)}`
            : ""}
        </Text>
      </View>
      <Text style={s.arrow}>›</Text>
    </Pressable>
  );
  return (
    <View style={s.map}>
      <Text style={s.explanation}>
        Your interests → plans → chosen steps. Open any step to change it or
        check in.
      </Text>
      {areas.map((areaId) => (
        <View key={areaId} style={s.area}>
          <Text style={s.areaTitle}>
            {areaId === "__unlinked__"
              ? "Other saved work"
              : (AREAS.find((area) => area.id === areaId)?.title ??
                "Saved interests")}
          </Text>
          {branches
            .filter(
              (branch) =>
                (branch.direction?.areaId ?? "__unlinked__") === areaId,
            )
            .map((branch) => (
              <View key={branch.key} style={s.branch}>
                {branch.direction && (
                  <Text style={s.interest}>{branch.direction.choice}</Text>
                )}
                {!branch.plans.length &&
                  !branch.tasks.length &&
                  !branch.notes.length && (
                    <Text style={s.empty}>No plan yet</Text>
                  )}
                {branch.plans.map(({ draft, tasks: planTasks, sources }) => {
                  const needsReview =
                    draft.state !== "parked" &&
                    draft.steps.some(
                      (step) => !step.accepted && !step.deferred,
                    );
                  const label =
                    draft.state === "parked"
                      ? "Parked plan"
                      : !planTasks.length || needsReview
                        ? "Needs review"
                        : planTasks.every((task) => task.done)
                          ? "Chosen steps done"
                          : "Plan";
                  return (
                    <View key={draft.id} style={s.plan}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Review plan: ${draft.title}`}
                        onPress={() => onOpenDraft(draft)}
                        style={s.planHeading}
                      >
                        <View style={s.grow}>
                          <Text style={s.planLabel}>{label}</Text>
                          <Text style={s.planTitle}>{draft.title}</Text>
                        </View>
                        <Text style={s.arrow}>›</Text>
                      </Pressable>
                      {sources.map((source, index) => (
                        <Pressable
                          key={source.id}
                          accessibilityRole="button"
                          accessibilityLabel={
                            source.id === draft.id
                              ? `Original thought for ${draft.title}`
                              : `Update ${index + 1} for ${draft.title}`
                          }
                          onPress={() => onOpenNote(source)}
                          style={s.sourceLink}
                        >
                          <Text style={s.link}>
                            {source.id === draft.id ? "Original" : "Update"}{" "}
                            {source.audioUri ? "recording" : "thought"} ↗
                          </Text>
                        </Pressable>
                      ))}
                      <View style={s.children}>
                        {planTasks.map(renderTask)}
                      </View>
                    </View>
                  );
                })}
                {branch.tasks.map(renderTask)}
                {branch.notes.map((note) => (
                  <Pressable
                    key={note.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open saved thought: ${note.title}`}
                    onPress={() => onOpenNote(note)}
                    style={s.note}
                  >
                    <View style={s.grow}>
                      <Text style={s.planLabel}>Ready to shape</Text>
                      <Text style={s.taskTitle}>
                        {note.title || "Saved thought"}
                      </Text>
                      <Text style={s.meta}>
                        {note.audioUri
                          ? "Original recording saved"
                          : "Original text saved"}
                      </Text>
                    </View>
                    <Text style={s.arrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ))}
        </View>
      ))}
      {!branches.length && (
        <Text style={s.empty}>
          Your first thought becomes a plan here. Its original words stay
          connected to every chosen step.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          empty
            ? `Start a plan for ${empty.direction!.choice}`
            : hasWork
              ? "Add a thought"
              : "Capture my first thought"
        }
        onPress={() => onCapture(empty?.direction)}
        style={s.capture}
      >
        <Text style={s.captureText}>
          {empty
            ? `Start a plan · ${empty.direction!.choice}`
            : hasWork
              ? "Add a thought"
              : "Capture my first thought"}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  map: { gap: 22 },
  explanation: { fontSize: 14, lineHeight: 21, color: "#52647C" },
  area: { gap: 12 },
  areaTitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#52647C",
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  branch: {
    borderLeftWidth: 2,
    borderLeftColor: "#DDE5F0",
    marginLeft: 3,
    paddingLeft: 14,
    gap: 10,
  },
  interest: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    color: "#142138",
  },
  empty: { fontSize: 14, lineHeight: 21, color: "#68788C" },
  plan: { gap: 2, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 12 },
  planHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  planLabel: {
    color: "#68788C",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    lineHeight: 17,
  },
  planTitle: {
    color: "#142138",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
  },
  sourceLink: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  link: { color: "#345BEE", fontSize: 12, fontWeight: "600" },
  children: { gap: 6 },
  task: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    padding: 11,
    backgroundColor: "#F3F5F8",
    borderRadius: 12,
    minHeight: 60,
  },
  currentTask: {
    backgroundColor: "#E9EEFF",
    borderWidth: 1,
    borderColor: "#AABDFB",
  },
  taskIcon: {
    fontSize: 18,
    color: "#68788C",
    alignSelf: "flex-start",
    paddingTop: 2,
  },
  done: { color: "#617C44" },
  currentLabel: {
    fontSize: 9,
    lineHeight: 15,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: "#345BEE",
  },
  taskTitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#142138",
    fontWeight: "500",
  },
  meta: { fontSize: 11, lineHeight: 18, color: "#68788C", marginTop: 2 },
  note: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
    minHeight: 60,
  },
  grow: { flex: 1, minWidth: 0 },
  arrow: { fontSize: 23, color: "#8797AD" },
  capture: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: "#345BEE",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
  },
  captureText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
});
