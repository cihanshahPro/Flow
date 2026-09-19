import test from "node:test";
import assert from "node:assert/strict";
import { directionOptions, journeyState } from "../src/journey.ts";
import { newProfile, AREAS } from "../src/personality.ts";

const profile = (extra = {}) => ({
  ...newProfile(),
  answers: Array(20).fill(3),
  areas: Object.fromEntries(AREAS.map((area) => [area.id, "Nothing current"])),
  ...extra,
});
const selected = () => profile({ areas: { work: ["Build something"], health: ["Movement or exercise"] } });
const [work, health] = directionOptions(selected());
const note = (extra = {}) => ({ id: "recording", title: "Voice note", text: "", audioUri: "file:///voice.m4a", createdAt: "2026-09-18T10:00:00Z", ...extra });
const draft = (extra = {}) => ({ id: "draft", title: "My saved plan", source: "Build a prototype", updates: [], topic: "Work", state: "draft", steps: [{ id: "step", title: "Build a prototype", minutes: 5 }], createdAt: "2026-09-18T11:00:00Z", ...extra });
const task = (extra = {}) => ({ id: "task", title: "Build a prototype", topic: "Work", minutes: 5, done: false, plannedDate: "", plannedTime: "", deadline: "", waitingOn: "", chaseDate: "", notes: "", createdAt: "2026-09-18T12:00:00Z", ...extra });

test("legacy selections become stable directions without inventing a personality score", () => {
  const p = profile({ answers: [1, 2, 0, 6, NaN, 3.5, 5], areas: { work: "Build something", people: "Later", admin: "Nothing current", health: ["Movement or exercise", "Health follow-up"], home: [] } });
  const options = directionOptions(p);
  assert.equal(options[0].directionId, "work:Build something");
  assert.equal(options[0].title, "Work & making: Build something");
  assert.equal(options.length, 3);
  const state = journeyState(p, [], [], []);
  assert.deepEqual(state.coverage, { answered: 3, reviewed: 3, deferred: 1 });
  assert.equal(state.level.number, 1);
  assert.equal("accuracy" in state.coverage, false);
});

test("restart resumes linked recording despite legacy completed flag", () => {
  const p = { ...selected(), completed: true };
  const saved = note({ direction: work });
  const state = journeyState(p, [saved], [], []);
  assert.equal(state.next.kind, "process");
  assert.equal(state.next.id, saved.id);
  assert.equal(state.next.direction.directionId, work.directionId);
  assert.equal(state.milestones[2].done, false);
});

test("saved text without a draft can resume processing", () => {
  const saved = note({ audioUri: undefined, text: "Build a prototype", direction: work });
  assert.equal(journeyState(selected(), [saved], [], []).next.kind, "process");
});

test("explicit focus wins over other directions and unrelated legacy tasks", () => {
  const p = { ...selected(), focus: health.title };
  const result = journeyState(p, [note({ direction: health })], [draft({ direction: work })], [task()]);
  assert.equal(result.next.kind, "process");
  assert.equal(result.next.direction.directionId, health.directionId);
});

test("within one direction resume task before draft before processing", () => {
  const p = selected();
  const n = note({ direction: work });
  const d = draft({ direction: work });
  assert.equal(journeyState(p, [n], [d], [task({ direction: work })]).next.kind, "task");
  assert.equal(journeyState(p, [n], [d], []).next.kind, "draft");
  assert.equal(journeyState(p, [n], [], []).next.kind, "process");
});

test("consumed drafts and their source notes do not loop back into processing", () => {
  const p = profile({ areas: { work: [work.choice] }, focus: work.title });
  const saved = note({ direction: work });
  const consumed = draft({ id: saved.id, direction: work, steps: [{ id: "step", title: "Build", minutes: 5, accepted: true }] });
  const state = journeyState(p, [saved], [consumed], [task({ direction: work, done: true })]);
  assert.equal(state.next.kind, "complete");
  assert.equal(state.level.number, 4);
});

test("a finished direction advances to the next unopened selected direction", () => {
  const p = { ...selected(), focus: work.title };
  const state = journeyState(p, [], [], [task({ direction: work, done: true })]);
  assert.equal(state.next.kind, "starter");
  assert.equal(state.next.direction.directionId, health.directionId);
});

test("most recent legacy unfinished work stays usable without a guessed link", () => {
  const result = journeyState(selected(), [note()], [draft({ createdAt: "2026-09-18T14:00:00Z" })], [task()]);
  assert.equal(result.next.kind, "draft");
  assert.equal(result.next.title, "Continue your saved draft");
  assert.equal(result.next.direction, undefined);
});

test("parked, deferred, consumed and example drafts do not become next actions", () => {
  const ignored = [draft({ id: "parked", state: "parked" }), draft({ id: "deferred", steps: [{ id: "1", deferred: true }] }), draft({ id: "accepted", steps: [{ id: "1", accepted: true }] }), draft({ id: "example", example: true })];
  const result = journeyState(selected(), [], ignored, [task({ id: "flow:example:0", done: true })]);
  assert.equal(result.next.kind, "starter");
  assert.equal(result.milestones[2].done, false);
  assert.equal(result.milestones[3].done, false);
});

test("milestones reflect recorded assessment, reviewed areas and real actions", () => {
  assert.deepEqual(journeyState(profile(), [], [], []).milestones.map((m) => m.done), [true, true, false, false]);
  assert.equal(journeyState(profile(), [], [], []).level.title, "Mapped");
  assert.equal(journeyState(profile(), [], [], [task()]).level.title, "Ready to act");
  assert.equal(journeyState(profile(), [], [], [task({ done: true })]).level.title, "In motion");
  assert.equal(journeyState(newProfile(), [], [], []).next.kind, "setup");
});

test("new explicit focus starts that direction before unrelated saved work", () => {
  const p = { ...selected(), focus: health.title, focusExplicit: true };
  const state = journeyState(p, [note()], [], [task({ direction: work })]);
  assert.equal(state.next.kind, "starter");
  assert.equal(state.next.direction.directionId, health.directionId);
});

test("legacy focus keeps saved-work-first behavior without the explicit flag", () => {
  const p = { ...selected(), focus: health.title };
  const state = journeyState(p, [note()], [], [task({ direction: work })]);
  assert.equal(state.next.kind, "task");
  assert.equal(state.next.direction.directionId, work.directionId);
});

test("explicit focus resumes its own recording and advances after a completed action", () => {
  const p = { ...selected(), focus: health.title, focusExplicit: true };
  const saved = note({ direction: health });
  const waiting = task({ direction: work });
  assert.equal(journeyState(p, [saved], [], [waiting]).next.id, saved.id);
  const next = journeyState(p, [], [], [waiting, task({ id: "health-done", direction: health, done: true })]).next;
  assert.equal(next.kind, "task");
  assert.equal(next.id, waiting.id);
});

test("deselecting an interest preserves recovery of its audio, draft and task", () => {
  const p = profile({ areas: { health: [health.choice] } });
  const cases = [
    { notes: [note({ direction: work })], drafts: [], tasks: [], kind: "process" },
    { notes: [], drafts: [draft({ direction: work })], tasks: [], kind: "draft" },
    { notes: [], drafts: [], tasks: [task({ direction: work })], kind: "task" },
  ];
  for (const c of cases) {
    const state = journeyState(p, c.notes, c.drafts, c.tasks);
    assert.equal(state.next.kind, c.kind);
    assert.deepEqual(state.next.direction, work);
  }
});

test("unselected linked and legacy work share recency fallback without guessed links", () => {
  const p = profile({ areas: { health: [health.choice] } });
  const orphan = note({ direction: work, createdAt: "2026-09-18T16:00:00Z" });
  assert.equal(journeyState(p, [orphan], [draft()], []).next.kind, "process");
  const laterLegacy = draft({ createdAt: "2026-09-18T17:00:00Z" });
  const next = journeyState(p, [orphan], [laterLegacy], []).next;
  assert.equal(next.kind, "draft");
  assert.equal(next.direction, undefined);
});
