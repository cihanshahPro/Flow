import test from "node:test";
import assert from "node:assert/strict";
import { suggestDraft, appendPlanUpdate, missingThreadPoints, threadFingerprint } from "../src/drafts.ts";

const complete =
  "I need to finish the tax filing with my accountant before Friday because the deadline is strict, otherwise there is a penalty. First I have to collect the receipts, then tonight I'll email her.";
const vague = "Thinking about the garage situation and how messy it has gotten";

test("a vague dump keeps the thread open with one missing question first", () => {
  const draft = suggestDraft("t1", vague);
  assert.equal(draft.threadStatus, "dumped");
  assert.equal(draft.goalsReady, false);
  assert.ok(draft.missingPoints.length >= 1);
  assert.equal(draft.missingPoints[0], missingThreadPoints(vague)[0]);
  assert.ok(draft.threadPoints.some((p) => p.state === "missing"));
});

test("a first dump that answers every point is ready without a second recording", () => {
  const draft = suggestDraft("t2", complete);
  assert.deepEqual(draft.missingPoints, []);
  assert.equal(draft.threadStatus, "ready");
  assert.equal(draft.goalsReady, true);
  assert.ok(threadFingerprint(complete).every((p) => p.state === "known"));
});

test("answering the missing question moves the thread toward ready", () => {
  const first = suggestDraft("t3", "I want to sort out the garage.");
  assert.equal(first.threadStatus, "dumped");
  const answer = suggestDraft(
    "t3-a",
    "With my brother next Saturday because the car has to fit before winter. First we need boxes, then I'll book the dump run.",
  );
  const next = appendPlanUpdate(first, answer);
  assert.equal(next.threadStatus, "ready");
  assert.equal(next.goalsReady, true);
  assert.ok(next.missingPoints.length <= 2, "at most a couple of soft points remain");
  assert.equal(next.source, first.source, "original words stay intact");
});
