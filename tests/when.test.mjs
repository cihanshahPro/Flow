import { test } from "node:test";
import assert from "node:assert/strict";
import { whenFromAnswer } from "../src/when.ts";
import { moveWhen, suggestionChips, respondToRecording } from "../src/thread.ts";

// Friday 18 Sep 2026, 10:30 local.
const now = new Date(2026, 8, 18, 10, 30);

test("spoken times become real local dates and times", () => {
  assert.deepEqual(whenFromAnswer("Tomorrow morning", now), { date: "2026-09-19", time: "09:00", label: "Tomorrow morning" });
  assert.deepEqual(whenFromAnswer("This afternoon", now), { date: "2026-09-18", time: "14:00", label: "This afternoon" });
  assert.deepEqual(whenFromAnswer("This evening", now), { date: "2026-09-18", time: "19:00", label: "This evening" });
  assert.deepEqual(whenFromAnswer("tonight after dinner", now), { date: "2026-09-18", time: "19:00", label: "Tonight" });
  assert.deepEqual(whenFromAnswer("This weekend", now), { date: "2026-09-19", time: "09:00", label: "This weekend" });
  assert.deepEqual(whenFromAnswer("Next free 15 minutes", now), { date: "2026-09-18", time: "11:00", label: "Today" });
  assert.equal(whenFromAnswer("Not sure where to start", now), undefined);
});

test("a part of the day that has passed rolls to tomorrow", () => {
  const late = new Date(2026, 8, 18, 15, 0);
  assert.deepEqual(whenFromAnswer("This morning", late), { date: "2026-09-19", time: "09:00", label: "Tomorrow morning" });
  const night = new Date(2026, 8, 18, 22, 30);
  assert.deepEqual(whenFromAnswer("Next free 15 minutes", night), { date: "2026-09-19", time: "09:00", label: "Tomorrow morning" });
});

test("the move uses the time the person picked, not their default window", () => {
  const thread = { threadPoints: [{ id: "next", label: "Next", state: "known", value: "Tomorrow morning" }] };
  assert.equal(moveWhen(thread, now)?.label, "Tomorrow morning");
  assert.equal(moveWhen({ threadPoints: [] }, now), undefined);
});

test("a shaper-worded question gets no fixed chips unless it asks for the outcome", () => {
  const base = { id: "t1", title: "Pay bills", steps: [], messages: [], threadPoints: [] };
  const t = respondToRecording(base, "n1", "pay the bills", { now, question: "Do you have another payment method?" });
  const q = t.messages.find((m) => m.kind === "question");
  if (q && q.pointId !== "outcome") assert.equal(q.chips, undefined);
  assert.ok(suggestionChips("motivation").length > 0, "template questions keep their chips");
});
