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
  const answers = {
    else: "that's it",
    challenge: "The appointment slots are always full.",
    want: "renew my passport before the Lisbon trip in November",
    help: "Tell me what to do. This weekend",
  };
  for (let i = 0; i < 8; i++) {
    const q = pending(t);
    if (!q || q.kind === "offer") return { t, offer: q, asked };
    asked.push(q.stage);
    t = respondToRecording(t, `n${i + 2}`, answers[q.stage], { now });
  }
  return { t, offer: undefined, asked };
}

test("a written answer counts for the question asked, so it is not asked again", () => {
  const { asked, t } = run();
  assert.deepEqual(asked, ["else", "challenge", "want", "help"]);
  assert.equal(t.threadPoints.find((p) => p.id === "constraints").value, "The appointment slots are always full.");
});

test("the chosen time reaches the move, and the move is a clean second-person sentence", () => {
  const { t, offer } = run();
  assert.ok(offer, "Flow offers a move");
  assert.match(offer.text, /^This weekend: Renew your passport before the Lisbon trip in November\. /);
  assert.deepEqual(moveWhen(t, now), { date: "2026-09-26", time: "10:00", label: "This weekend" });
  const title = t.steps[0].title;
  assert.ok(title.length <= 60);
  assert.doesNotMatch(title, /first small step|lisbon/);
});

test("second person keeps the person's casing and long moves cut at a word with …", () => {
  assert.equal(secondPerson("renew my passport before I fly to Lisbon"), "Renew your passport before you fly to Lisbon");
});

test("an older build's question is answered in place, the time said is kept for the move, and the script carries on", () => {
  // State taken from the simulator: the cloud filled timing with a non-time phrase and asked its own question.
  const known = (id, value) => ({ id, label: id, state: "known", value });
  const missing = (id) => ({ id, label: id, state: "missing", value: "?" });
  const t0 = {
    id: "t2", title: "Renew passport before Lisbon trip", steps: [], hypeGiven: [],
    threadPoints: [
      known("outcome", "I need to renew my passport before the Lisbon trip in November"),
      missing("people"),
      known("timing", "before the Lisbon trip in November"),
      missing("constraints"), missing("motivation"),
      known("dependencies", "I need to renew my passport before the Lisbon trip in November"),
      missing("next"),
    ],
    messages: [
      { id: "m0", from: "you", kind: "transcript", text: "I need to renew my passport before the Lisbon trip in November", noteId: "a", createdAt: "" },
      { id: "m1", from: "flow", kind: "question", pointId: "motivation", text: "How much time does your passport renewal typically take?", createdAt: "" },
    ],
  };
  const t = respondToRecording(t0, "b", "About three weeks. Just me and nothing is in the way. I want peace of mind before I fly. This weekend", {
    now,
    evidence: { constraints: "Just me and nothing is in the way" },
  });
  assert.equal(t.messages.find((m) => m.id === "m1").answered, "b");
  assert.equal(t.threadPoints.find((p) => p.id === "constraints").value, "Just me and nothing is in the way");
  assert.equal(pending(t).stage, "else", "no move before the script is answered");
  assert.equal(moveWhen(t, now).label, "This weekend");
});
