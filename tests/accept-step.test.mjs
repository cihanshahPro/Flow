import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
register("./accept-loader.mjs", import.meta.url);
const { acceptStep } = await import("../src/services/drafts.ts");
const { db } = await import("./accept-mocks.mjs");
const { exampleDraft } = await import("../src/drafts.ts");

// Regression: answerChip already marks the step accepted and App saves that
// thread BEFORE acceptStep runs. The move task must still be created.
test("acceptStep creates the move task even when the step is already flagged accepted", async () => {
  const draft = exampleDraft("t1");
  const step = { ...draft.steps[0], accepted: true };
  const thread = { ...draft, steps: [step, ...draft.steps.slice(1)] };
  db.reset();
  db.drafts.set(thread.id, JSON.stringify(thread));
  await acceptStep(thread, step);
  assert.ok(db.records.has(`flow:${thread.id}:${step.id}`));
});

test("acceptStep is idempotent", async () => {
  const draft = exampleDraft("t2");
  const step = draft.steps[0];
  db.reset();
  db.drafts.set(draft.id, JSON.stringify(draft));
  await acceptStep(draft, step);
  await acceptStep(draft, step);
  assert.equal(db.records.size, 1);
});
