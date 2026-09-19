import test from "node:test";
import assert from "node:assert/strict";
import { suggestDraft, refineDraft, taskForStep } from "../src/drafts.ts";

test("an accepted action and follow-up retain their direction while preserving the captured words", () => {
  const source =
    "Call Alex about the website. I only have an afternoon available.";
  const direction = {
    directionId: "work:client-project",
    areaId: "work",
    choice: "Build a client project",
  };
  const draft = { ...suggestDraft("thought", source), direction };
  const refined = refineDraft(draft, "Email the designer.");
  const task = taskForStep(refined, refined.steps[0], "2026-09-20");
  assert.deepEqual(refined.direction, direction);
  assert.deepEqual(task.direction, direction);
  assert.equal(refined.source, source);
  assert.equal(task.notes, source + "\n\nUpdate: Email the designer.");
  assert.equal(task.title, "Call Alex about the website");
  assert.equal(task.plannedTime, "");
  assert.equal(task.deadline, "");
  assert.equal(task.id, "flow:thought:0");
});

test("legacy drafts remain usable without a direction", () => {
  const draft = suggestDraft("legacy", "Call Alex.");
  assert.equal(taskForStep(draft, draft.steps[0]).direction, undefined);
});
