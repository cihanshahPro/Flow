import { test } from "node:test";
import assert from "node:assert/strict";
import { respondToRecording, answerChip, moveWhen, secondPerson } from "../src/thread.ts";

// The listing worker's scenario: "Renew my passport…", a written obstacle, then "This weekend".
const now = new Date(2026, 8, 21, 20, 0); // Monday evening
const pending = (t) => [...t.messages].reverse().find((m) => !m.answered && (m.kind === "question" || m.kind === "offer"));

function run() {
  let t = { id: "t1", title: "Renew my passport before the Lisbon…", steps: [], messages: [], threadPoints: [] };
  t = respondToRecording(t, "n1", "Renew my passport before the Lisbon trip in November.", { now });
  const asked = [];
  for (let i = 0; i < 8; i++) {
    const q = pending(t);
    if (!q || q.kind === "offer") return { t, offer: q, asked };
    asked.push(q.pointId);
    if (q.pointId === "constraints") t = respondToRecording(t, `n${i + 2}`, "The appointment slots are always full.", { now });
    else t = answerChip(t, q.id, (q.chips.find((c) => c.label === "This weekend") ?? q.chips[0]).id, { now }).thread;
  }
  return { t, offer: undefined, asked };
}

test("a written answer counts for the question asked, so it is not asked again", () => {
  const { asked, t } = run();
  assert.equal(asked.filter((p) => p === "constraints").length, 1);
  assert.equal(t.threadPoints.find((p) => p.id === "constraints").value, "The appointment slots are always full.");
});

test("the chosen time reaches the move, and the move is a clean second-person sentence", () => {
  const { t, offer } = run();
  assert.ok(offer, "Flow offers a move");
  assert.equal(offer.text, "This weekend: Renew your passport before the Lisbon trip in November");
  assert.deepEqual(moveWhen(t, now), { date: "2026-09-26", time: "10:00", label: "This weekend" });
  const title = t.steps[0].title;
  assert.ok(title.length <= 60);
  assert.doesNotMatch(title, /first small step|lisbon/);
});

test("second person keeps the person's casing and long moves cut at a word with …", () => {
  assert.equal(secondPerson("renew my passport before I fly to Lisbon"), "Renew your passport before you fly to Lisbon");
});
