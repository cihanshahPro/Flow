import test from "node:test";
import assert from "node:assert/strict";
import { newProfile } from "../src/personality.ts";
import { directionOptions, journeyState } from "../src/journey.ts";
import { starterDraft } from "../src/starters.ts";
import { taskForStep } from "../src/drafts.ts";
test("accepting a suggested starter creates a stable linked action and moves the journey forward after reload", () => {
  const p = {
    ...newProfile(),
    areas: { work: ["Build something", "Find work or clients"] },
  };
  const direction = directionOptions(p)[0];
  const draft = starterDraft(direction);
  assert.equal(journeyState(p, [], [], []).next.kind, "starter");
  assert.ok(draft.source.includes("not a transcript"));
  const accepted = {
    ...draft,
    steps: draft.steps.map((s) => ({ ...s, accepted: true })),
  };
  const task = taskForStep(draft, draft.steps[0]);
  assert.equal(
    task.id,
    taskForStep(starterDraft(direction), draft.steps[0]).id,
  );
  assert.deepEqual(task.direction, direction);
  const restored = JSON.parse(
    JSON.stringify({ p, drafts: [accepted], tasks: [task] }),
  );
  const ready = journeyState(restored.p, [], restored.drafts, restored.tasks);
  assert.equal(ready.next.kind, "task");
  assert.equal(ready.level.number, 3);
  const done = journeyState(p, [], [accepted], [{ ...task, done: true }]);
  assert.equal(done.level.number, 4);
  assert.equal(done.next.kind, "starter");
  assert.equal(done.next.direction.choice, "Find work or clients");
});
