import test from "node:test";
import assert from "node:assert/strict";
import { appendPlanUpdate, suggestDraft } from "../src/drafts.ts";
import { journeyState } from "../src/journey.ts";
import { newProfile } from "../src/personality.ts";

test("updates retain original words and chosen step IDs, retry cannot duplicate", () => {
  const original = suggestDraft(
    "plan",
    "Call the designer. Then review the homepage.",
  );
  original.steps = original.steps.map((step) => ({ ...step, accepted: true }));
  const update = suggestDraft("voice:file:9", "Send the final screenshot.");
  const merged = appendPlanUpdate(original, update);
  assert.equal(merged.source, original.source);
  assert.deepEqual(merged.steps.slice(0, 2), original.steps);
  assert.equal(merged.steps.length, 3);
  assert.deepEqual(merged.sourceNoteIds, [update.id]);
  assert.deepEqual(appendPlanUpdate(merged, update), merged);
});

test("processed plan updates and deliberately kept notes cannot become intake chores", () => {
  const plan = {
    ...suggestDraft("plan", "A saved idea."),
    sourceNoteIds: ["update"],
    state: "parked",
  };
  const notes = [
    {
      id: "update",
      planId: "plan",
      text: "A saved update",
      createdAt: "2026-09-18",
      title: "Update",
    },
    {
      id: "reference",
      captureKind: "note",
      text: "A reference",
      createdAt: "2026-09-18",
      title: "Note",
    },
    {
      id: "feedback",
      captureKind: "feedback",
      text: "The button was confusing",
      createdAt: "2026-09-18",
      title: "Feedback",
    },
  ];
  assert.equal(
    journeyState(newProfile(), notes, [plan], []).next.kind,
    "setup",
  );
  const unsaved = { ...notes[0], id: "unprocessed" };
  assert.equal(
    journeyState(newProfile(), [unsaved], [plan], []).next.kind,
    "process",
  );
});
