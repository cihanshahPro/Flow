import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestDraft,
  refineDraft,
  taskForStep,
  exampleDraft,
} from "../src/drafts.ts";
test("a reflection does not turn into invented tasks", () => {
  assert.equal(
    suggestDraft("1", "I feel uncertain about what I want.").steps.length,
    0,
  );
});
test("explicit actions are bounded and deduplicated, and contact details survive", () => {
  const d = suggestDraft(
    "1",
    "Email sam@example.com. Then call the supplier. Then call the supplier. Then review the offer. Then buy materials.",
  );
  assert.equal(d.steps.length, 3);
  assert.equal(taskForStep(d, d.steps[0]).email, "sam@example.com");
});
test("acceptance produces stable IDs without inventing calendar times", () => {
  const d = exampleDraft("a");
  const a = taskForStep(d, d.steps[0], "2026-09-20");
  assert.equal(a.id, taskForStep(d, d.steps[0]).id);
  assert.equal(a.plannedTime, "");
  assert.equal(a.deadline, "");
  assert.equal(a.plannedDate, "2026-09-20");
});
test("follow-ups preserve original input and keep visible suggestions bounded", () => {
  let d = exampleDraft("a");
  d = refineDraft(d, "Email a friend. Then call a designer.");
  assert.equal(d.steps.length, 3);
  assert.ok(d.source.includes("afternoons"));
  assert.equal(d.updates.length, 1);
});
test("empty and oversized input is rejected", () => {
  assert.throws(() => suggestDraft("1", ""));
  assert.throws(() => suggestDraft("1", "x".repeat(20001)));
});

test("AI draft keeps the full source and rejects invented evidence", async () => {
  const { shapedDraft } = await import("../src/drafts.ts");
  const source = "I need to call Alex. I am not ready to hire anyone.";
  const choice = {
    label: "Contact Alex",
    action: "Call Alex",
    smallAction: "Open Alex’s contact",
    reason: "A small first step.",
    evidence: "call Alex",
  };
  const draft = shapedDraft("a", source, {
    title: "Reach out",
    summary: "Contact Alex without hiring anyone.",
    choices: [
      choice,
      { ...choice, action: "Hire staff", evidence: "hire staff" },
    ],
  });
  assert.equal(draft.steps.length, 1);
  assert.equal(draft.source, source);
  assert.equal(draft.organizer, "apple-local");
  assert.equal(draft.summary, source);
  assert.throws(() =>
    shapedDraft("a", source, {
      title: "a",
      summary: "b",
      choices: [{ ...choice, evidence: "not in source" }],
    }),
  );
  assert.equal(
    shapedDraft("a", source, { title: "a", summary: "b", choices: [] }).steps
      .length,
    0,
  );
  assert.throws(() =>
    shapedDraft("a", source, {
      title: "a",
      summary: "b",
      choices: Array(4).fill(choice),
    }),
  );
});
