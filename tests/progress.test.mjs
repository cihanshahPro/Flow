import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { AREAS, newProfile } from "../src/personality.ts";
import { exampleDraft, taskForStep } from "../src/drafts.ts";
import {
  newProgress,
  reconcileProgress,
  levelForProgress,
} from "../src/progress.ts";
register("./progress-loader.mjs", import.meta.url);
const { syncProgress } = await import("../src/services/progress.ts");
const { harness, Platform } = await import("./progress-mocks.mjs");
const now = "2026-09-18T12:00:00.000Z";
const full = (patch = {}) => ({
  ...newProfile(),
  answers: Array(20).fill(3),
  areas: Object.fromEntries(AREAS.map((area) => [area.id, [area.choices[0]]])),
  focus: "Work & making: Build something",
  focusExplicit: true,
  presentation: "small",
  preferredMinutes: 30,
  ...patch,
});
const task = (id, done = true) => ({
  id,
  done,
  title: "Review a project",
  topic: "Work",
  minutes: 10,
  plannedDate: "",
  plannedTime: "",
  deadline: "",
  waitingOn: "",
  chaseDate: "",
  notes: "",
  createdAt: now,
});

// A profile is setup information. Only completed actions earn accomplishment credit.
test("incomplete profiles stay locked even with completed tasks and old setup flags", () => {
  const progress = reconcileProgress(
    undefined,
    { ...newProfile(), completed: true },
    [task("a")],
    [],
    now,
  );
  assert.deepEqual(progress, newProgress());
  assert.deepEqual(levelForProgress(progress), {
    unlocked: false,
    level: null,
    completedCount: 0,
    movesDone: 0,
    threadsUnderstood: 0,
    checkIns: 0,
    next: null,
    milestones: levelForProgress(progress).milestones.map((milestone) => ({
      ...milestone,
      reached: false,
    })),
  });
  // Finishing the quiz is the unlock; the time preference is no longer required.
  assert.equal(
    reconcileProgress(
      undefined,
      full({ preferredMinutes: undefined }),
      [task("a")],
      [],
      now,
    ).unlockedAt,
    now,
  );
  assert.equal(
    reconcileProgress(undefined, full({ answers: Array(19).fill(3) }), [task("a")], [], now).unlockedAt,
    undefined,
  );
});

test("a finished quiz unlocks Starting point with no reward for the quiz itself", () => {
  const progress = reconcileProgress(undefined, full(), [], [], now);
  assert.equal(progress.unlockedAt, now);
  assert.deepEqual(progress.completedTaskIds, []);
  assert.deepEqual(levelForProgress(progress).level, {
    number: 1,
    title: "Starting point",
  });
  assert.equal(levelForProgress(progress).next.remaining, 1);
});

test("existing completed work is recognized at unlock, excluding incomplete and example actions", () => {
  const sample = exampleDraft("preview-uuid");
  const sampleTask = { ...taskForStep(sample, sample.steps[0]), done: true };
  const progress = reconcileProgress(
    undefined,
    full(),
    [
      task("a"),
      task("pending", false),
      sampleTask,
      task("flow:example:example"),
    ],
    [sample],
    now,
  );
  assert.deepEqual(progress.completedTaskIds, ["a"]);
  assert.deepEqual(levelForProgress(progress).level, {
    number: 2,
    title: "Building",
  });
});

test("reconciliation is immutable and repeated or duplicate IDs award only once", () => {
  const profile = full();
  const previous = { version: 1, unlockedAt: now, completedTaskIds: ["a"] };
  const tasks = [task("a"), task("b"), task("b")];
  const before = JSON.stringify({ previous, profile, tasks });
  const next = reconcileProgress(previous, profile, tasks, [], "later");
  assert.equal(JSON.stringify({ previous, profile, tasks }), before);
  assert.deepEqual(next.completedTaskIds, ["a", "b"]);
  assert.notEqual(next.completedTaskIds, previous.completedTaskIds);
  assert.deepEqual(reconcileProgress(next, profile, tasks, [], "later"), next);
});

test("profile edits, undo, task deletion and reaccepting a task cannot remove or duplicate earned wins", () => {
  const earned = reconcileProgress(undefined, full(), [task("a")], [], now);
  const incomplete = full({ answers: [] });
  assert.deepEqual(
    reconcileProgress(earned, incomplete, [], [], "later"),
    earned,
  );
  assert.deepEqual(
    reconcileProgress(earned, incomplete, [task("a", false)], [], "later"),
    earned,
  );
  assert.deepEqual(
    reconcileProgress(earned, incomplete, [task("a")], [], "later"),
    earned,
  );
  assert.deepEqual(
    reconcileProgress(earned, incomplete, [task("b")], [], "later")
      .completedTaskIds,
    ["a", "b"],
  );
});

test("level thresholds and remaining actions are explicit without streak penalties", () => {
  const cases = [
    [0, 1, 1],
    [1, 2, 2],
    [2, 2, 1],
    [3, 3, 4],
    [6, 3, 1],
    [7, 4, 8],
    [14, 4, 1],
    [15, 5, 10],
    [24, 5, 1],
    [25, 6, 10],
    [35, 7, 10],
  ];
  for (const [count, level, remaining] of cases) {
    const summary = levelForProgress({
      version: 1,
      unlockedAt: now,
      completedTaskIds: Array.from({ length: count }, (_, i) => `task-${i}`),
    });
    assert.equal(summary.level.number, level);
    assert.equal(summary.next.remaining, remaining);
    assert.equal(summary.completedCount, count);
    assert.ok(summary.next.threshold > count);
    assert.equal(
      summary.milestones.filter((milestone) => milestone.reached).length,
      Math.min(level, 5),
    );
  }
});

const seed = (profile = full()) => {
  harness.reset();
  harness.saveRecord("flow-profile-v1", "profile", profile);
};

test("SQLite reconciliation adds one progress record without changing existing data, and persists reload state", async () => {
  seed();
  harness.saveRecord("a", "task", task("a"));
  harness.saveRecord("note", "note", { text: "Keep my original words" });
  const before = harness.db.prepare("SELECT * FROM records ORDER BY id").all();
  const first = await syncProgress();
  assert.deepEqual(first.completedTaskIds, ["a"]);
  assert.deepEqual(harness.progress(), first);
  const reloaded = await syncProgress();
  assert.deepEqual(reloaded, first);
  assert.equal(harness.writes, 1);
  assert.deepEqual(
    harness.db
      .prepare("SELECT * FROM records WHERE kind != 'progress' ORDER BY id")
      .all(),
    before,
  );
});

test("SQLite sync migrates an existing incomplete profile only when the quiz is finished", async () => {
  seed(full({ answers: [] }));
  harness.saveRecord("a", "task", task("a"));
  assert.deepEqual(await syncProgress(), newProgress());
  harness.saveRecord("flow-profile-v1", "profile", full());
  assert.deepEqual((await syncProgress()).completedTaskIds, ["a"]);
  harness.saveRecord("flow-profile-v1", "profile", newProfile());
  harness.db.prepare("DELETE FROM records WHERE id='a'").run();
  assert.deepEqual((await syncProgress()).completedTaskIds, ["a"]);
});

test("SQLite sync reads saved example drafts and excludes all of their accepted steps", async () => {
  seed();
  const sample = exampleDraft("sample-uuid");
  harness.db
    .prepare("INSERT INTO flow_drafts VALUES (?,?)")
    .run(sample.id, JSON.stringify(sample));
  for (const step of sample.steps) {
    const example = { ...taskForStep(sample, step), done: true };
    harness.saveRecord(example.id, "task", example);
  }
  assert.equal(levelForProgress(await syncProgress()).completedCount, 0);
});

test("failed SQLite writes and failed commits cannot expose an unsaved unlock; a retry recovers", async () => {
  for (const failure of ["failWrite", "failCommit"]) {
    seed();
    harness.saveRecord("a", "task", task("a"));
    harness[failure] = true;
    await assert.rejects(syncProgress(), /storage busy|commit failed/);
    assert.equal(harness.progress(), undefined);
    harness[failure] = false;
    assert.deepEqual((await syncProgress()).completedTaskIds, ["a"]);
  }
});

test("simultaneous reconciliation calls serialize their transactions and never double award", async () => {
  seed();
  harness.saveRecord("a", "task", task("a"));
  const results = await Promise.all(
    Array.from({ length: 8 }, () => syncProgress()),
  );
  assert.ok(results.every((result) => result.completedTaskIds.join() === "a"));
  assert.equal(harness.maxTransactions, 1);
  assert.equal(harness.writes, 1);
});

test("web transactions preserve the same saved ledger and idempotency", async () => {
  seed();
  Platform.OS = "web";
  harness.saveRecord("a", "task", task("a"));
  const first = await syncProgress();
  harness.saveRecord("a", "task", task("a", false));
  assert.deepEqual(await syncProgress(), first);
  harness.saveRecord("a", "task", task("a"));
  assert.deepEqual(await syncProgress(), first);
});

test("an unknown progress schema is retained rather than silently resetting earned accomplishments", async () => {
  seed();
  const future = { version: 2, completedTaskIds: ["important-win"] };
  harness.saveRecord("flow-progress-v1", "progress", future);
  await assert.rejects(
    syncProgress(),
    /saved accomplishments could not be read/,
  );
  assert.deepEqual(harness.progress(), future);
});
