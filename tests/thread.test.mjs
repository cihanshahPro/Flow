import test from "node:test";
import assert from "node:assert/strict";
import {
  fingerprint,
  clarity,
  isReady,
  detectPoints,
  extractDueHints,
  routeRecording,
  respondToRecording,
  answerChip,
  evaluateThread,
  stageFor,
  pendingMessage,
  offerableSteps,
  repeatedPattern,
  peopleMentioned,
  TOTAL_POINTS,
} from "../src/thread.ts";
import { suggestDraft } from "../src/drafts.ts";
import { modeFor, flowType } from "../src/flow-voice.ts";
import { ITEMS } from "../src/personality.ts";

const now = new Date("2026-09-19T15:00:00.000Z");
const vague = "Thinking about the garage situation and how messy it has gotten.";
const rich =
  "I need to finish the tax filing with my accountant before Friday because the deadline is strict, otherwise there is a penalty. First I have to collect the receipts, then tonight I'll email her.";

function thread(text, id = "t1") {
  return suggestDraft(id, text, now);
}

test("fingerprint has seven points and keeps the person's own sentence as evidence", () => {
  const points = fingerprint(rich);
  assert.equal(points.length, TOTAL_POINTS);
  const outcome = points.find((p) => p.id === "outcome");
  assert.equal(outcome.state, "known");
  assert.match(outcome.value, /finish the tax filing/);
  assert.equal(points.find((p) => p.id === "people").state, "known");
  assert.equal(points.find((p) => p.id === "timing").state, "known");
  assert.equal(points.find((p) => p.id === "motivation").state, "known");
  assert.equal(points.find((p) => p.id === "dependencies").state, "known");
  assert.equal(points.find((p) => p.id === "next").state, "known");
  assert.ok(isReady(points));
});

test("a vague dump is mostly missing and not ready", () => {
  const points = fingerprint(vague);
  assert.ok(clarity(points).known < 3);
  assert.equal(isReady(points), false);
  assert.equal(points.find((p) => p.id === "outcome").state, "missing");
});

test("known points never regress when a later answer says less", () => {
  const first = fingerprint(rich, [], "n1");
  const later = fingerprint("Not sure.", first, "n2");
  assert.deepEqual(
    later.map((p) => p.state),
    first.map((p) => p.state),
  );
  assert.deepEqual(later.find((p) => p.id === "outcome").sourceNoteIds, ["n1"]);
});

test("detectPoints finds people by name and relation", () => {
  const found = detectPoints("I should call Sam about the invoice. My landlord wants it by Monday.");
  assert.ok(found.people);
  assert.ok(found.timing);
});

test("due hints resolve weekday and relative phrases to calendar days", () => {
  // 2026-09-19 is a Saturday.
  const hints = extractDueHints("Do it before Friday, and tomorrow I call. Also Oct 3.", now);
  assert.deepEqual(
    hints.map((h) => h.date),
    ["2026-09-20", "2026-09-25", "2026-10-03"],
  );
  assert.equal(extractDueHints("nothing dated here", now).length, 0);
});

test("a recording joins the thread that shares its vocabulary, otherwise starts a new one", () => {
  const garage = thread("The garage is a mess and I want to clear the garage shelves this weekend.", "garage");
  const taxes = thread("Finish the tax filing with my accountant.", "taxes");
  assert.equal(
    routeRecording("The garage shelves also need new brackets before I clear them.", [garage, taxes]),
    "garage",
  );
  assert.equal(routeRecording("Book a dentist appointment for the kids.", [garage, taxes]), null);
  assert.equal(routeRecording("ok", [garage, taxes]), null);
  assert.equal(
    routeRecording("The garage shelves also need new brackets.", [{ ...garage, state: "parked" }, taxes]),
    null,
  );
});

test("Flow replies to a dump with an acknowledgement and exactly one question", () => {
  const t = respondToRecording(thread(vague), "n1", vague, { mode: "explorer", now });
  const kinds = t.messages.map((m) => `${m.from}:${m.kind}`);
  assert.deepEqual(kinds, ["you:transcript", "flow:ack", "flow:question"]);
  assert.equal(pendingMessage(t).kind, "question");
  assert.equal(t.messages[2].pointId, "outcome", "explorer asks about the outcome first");
  assert.equal(t.threadStatus, "dumped");
  // Same note twice does not duplicate the conversation.
  assert.equal(respondToRecording(t, "n1", vague, { now }), t);
});

test("connector mode asks about people first", () => {
  const t = respondToRecording(thread("Sort out the garage."), "n1", "Sort out the garage.", { mode: "connector", now });
  assert.equal(pendingMessage(t).pointId, "people");
});

test("the shaper's reply and question win over templated wording", () => {
  const t = respondToRecording(thread(vague), "n1", vague, {
    now,
    reply: "Garage — got it, I'll hold that.",
    question: "What would 'done' look like for the garage?",
  });
  assert.equal(t.messages[1].text, "Garage — got it, I'll hold that.");
  assert.equal(t.messages[2].text, "What would 'done' look like for the garage?");
});

test("answering the question marks it answered, fills the meter, and a ready thread gets hyped once and offered a move", () => {
  const start = respondToRecording(thread("I want to clear the garage."), "n1", "I want to clear the garage.", {
    mode: "builder",
    now,
  });
  const before = clarity(start.threadPoints).known;
  const answer =
    "With my brother next Saturday because the car has to fit before winter. First we need boxes, then I'll book the dump run.";
  const next = respondToRecording(start, "n2", answer, { mode: "builder", now });
  assert.ok(clarity(next.threadPoints).known > before);
  assert.equal(next.messages.find((m) => m.kind === "question").answered, "n2");
  assert.ok(isReady(next.threadPoints));
  assert.equal(next.goalsReady, true);
  assert.ok(next.messages.some((m) => m.kind === "hype"));
  const offer = pendingMessage(next);
  assert.equal(offer.kind, "offer");
  assert.deepEqual(offer.chips.map((c) => c.id), ["do", "skip"]);
  assert.deepEqual(next.hypeGiven, ["ready"]);
  // A further recording does not hype again.
  const again = respondToRecording(next, "n3", "Also I should ask Dad for the trailer.", { mode: "builder", now });
  assert.equal(again.messages.filter((m) => m.kind === "hype").length, 1);
});

test("Do this accepts the move; Not now offers the next one, then holds", () => {
  const t = respondToRecording(thread(rich), "n1", rich, { mode: "analyst", now });
  const offer = pendingMessage(t);
  assert.equal(offer.kind, "offer");
  const accepted = answerChip(t, offer.id, "do", { now });
  assert.deepEqual(accepted.effects, [{ type: "accept", stepId: offer.stepId }]);
  assert.equal(accepted.thread.messages.find((m) => m.id === offer.id).answered, "do");
  assert.equal(accepted.thread.messages.at(-2).kind, "reply");
  // Answering twice is a no-op.
  assert.deepEqual(answerChip(accepted.thread, offer.id, "do", { now }).effects, []);

  let declined = answerChip(t, offer.id, "skip", { now });
  assert.deepEqual(declined.effects, []);
  assert.deepEqual(declined.thread.declinedStepIds, [offer.stepId]);
  let pending = pendingMessage(declined.thread);
  let guard = 0;
  while (pending?.kind === "offer" && guard++ < 5) {
    declined = answerChip(declined.thread, pending.id, "skip", { now });
    pending = pendingMessage(declined.thread);
  }
  assert.equal(offerableSteps(declined.thread).length, 0);
  assert.equal(pending, null);
});

test("Flow checks in after a mentioned date passes and a Yes counts as evidence", () => {
  const t = respondToRecording(thread("I want to send the invoice before Friday."), "n1", "I want to send the invoice before Friday.", {
    now,
  });
  assert.equal(t.dueHints[0].date, "2026-09-25");
  assert.equal(evaluateThread(t, [], { now }), t, "nothing to add before the date");
  // Answer the open question first so Flow has room to ask.
  const answered = { ...t, messages: t.messages.map((m) => ({ ...m, answered: m.answered ?? "x" })) };
  const later = new Date("2026-09-27T09:00:00.000Z");
  const checked = evaluateThread(answered, [], { now: later });
  const check = pendingMessage(checked);
  assert.equal(check.kind, "checkin");
  assert.match(check.text, /past friday/i);
  assert.equal(evaluateThread(checked, [], { now: later }), checked, "never stacks a second check-in");
  const yes = answerChip(checked, check.id, "yes", { now: later });
  assert.deepEqual(yes.effects, [{ type: "credit", id: check.id }]);
  assert.equal(yes.thread.messages.at(-1).kind, "hype");
  const no = answerChip(checked, check.id, "no", { now: later });
  assert.deepEqual(no.effects, []);
});

test("an accepted move that slipped past its day gets a Done / Not yet check-in", () => {
  const t = respondToRecording(thread(rich), "n1", rich, { now });
  const offer = pendingMessage(t);
  const { thread: accepted } = answerChip(t, offer.id, "do", { now });
  const task = { id: `flow:${t.id}:${offer.stepId}`, title: "Collect the receipts", done: false, plannedDate: "2026-09-19" };
  assert.equal(stageFor(accepted, [task]), "moving");
  const later = new Date("2026-09-21T09:00:00.000Z");
  const checked = evaluateThread(accepted, [task], { now: later });
  const check = pendingMessage(checked);
  assert.equal(check.kind, "checkin");
  assert.equal(check.taskId, task.id);
  const yes = answerChip(checked, check.id, "yes", { now: later });
  assert.ok(yes.effects.some((e) => e.type === "complete" && e.taskId === task.id));
  assert.equal(stageFor(accepted, [{ ...task, done: true }]), "done");
  assert.equal(evaluateThread(accepted, [{ ...task, done: true }], { now: later }), accepted);
});

test("a quiet thread gets one Still on it / Park it prompt, and parking is honoured", () => {
  const t = respondToRecording(thread(vague), "n1", vague, { now });
  const answered = { ...t, messages: t.messages.map((m) => ({ ...m, answered: m.answered ?? "x" })) };
  const later = new Date("2026-09-24T09:00:00.000Z");
  const stale = evaluateThread(answered, [], { now: later });
  const prompt = pendingMessage(stale);
  assert.equal(prompt.kind, "stale");
  const parked = answerChip(stale, prompt.id, "park", { now: later });
  assert.deepEqual(parked.effects, [{ type: "park" }]);
  assert.equal(parked.thread.state, "parked");
  assert.equal(evaluateThread(parked.thread, [], { now: new Date("2026-10-24") }), parked.thread);
  const still = answerChip(stale, prompt.id, "still", { now: later });
  assert.equal(still.thread.state, "draft");
  assert.equal(pendingMessage(still.thread).kind, "question");
});

test("patterns and people are noticed across threads without creating anything", () => {
  const a = thread("Call Sam about the invoice, then email the designer.", "a");
  const b = thread("Call Sam about the invoice. Ask Sam for the files too.", "b");
  assert.equal(repeatedPattern([a, b]).title.toLowerCase().includes("call sam"), true);
  assert.deepEqual(peopleMentioned([a, b]), ["Sam"]);
  assert.equal(repeatedPattern([a]), null);
});

test("Flow types come from the Big Five answers and never expose a four-letter code", () => {
  const high = ITEMS.map((item) => (item.reverse ? 1 : 5));
  const low = ITEMS.map((item) => (item.reverse ? 5 : 1));
  assert.equal(modeFor(high), "connector");
  assert.equal(modeFor(low), "explorer");
  assert.equal(modeFor([]), null);
  const t = flowType(high);
  assert.equal(t.name, "Coordinator");
  assert.doesNotMatch(JSON.stringify(t), /[EI][NS][FT][JP]/);
});
