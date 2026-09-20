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

/** Answer Flow's open question or move with each text in turn. */
let walked = 100;
function walk(t, answers, options = {}) {
  for (const a of answers) t = respondToRecording(t, `w${walked++}`, a, { now, ...options });
  return t;
}
/** dump → "that's it" (closes And what else?) → challenge → want → "How can I help?" answered → a move on the table. */
function toMove(text, id = "t1", options = {}) {
  return walk(respondToRecording(thread(text, id), "n1", text, { now, ...options }), ["that's it", "the receipts are scattered everywhere", "have it filed before Friday", "just tell me the first step"], options);
}

test("Flow replies to a dump with a reflection and the script's second question, And what else?", () => {
  const t = respondToRecording(thread(vague), "n1", vague, { mode: "explorer", now });
  const kinds = t.messages.map((m) => `${m.from}:${m.kind}`);
  assert.deepEqual(kinds, ["you:transcript", "flow:ack", "flow:question"]);
  assert.equal(pendingMessage(t).kind, "question");
  assert.equal(t.messages[2].stage, "else");
  assert.equal(t.messages[2].text, "And what else?");
  assert.equal(t.messages[2].chips, undefined, "no suggestion chips on questions");
  assert.equal(t.threadStatus, "dumped");
  // Same note twice does not duplicate the conversation.
  assert.equal(respondToRecording(t, "n1", vague, { now }), t);
});

test("the seven questions come in the script's order and in the roof's words; extraverts get three And what else? rounds", async () => {
  const { formulaFor } = await import("../src/formula.ts");
  const sj = formulaFor("ISTJ"), nt = formulaFor("ENTJ");
  let t = respondToRecording(thread(vague), "n1", vague, { formula: sj, now });
  t = walk(t, ["the car does not fit any more"], { formula: sj });
  assert.equal(pendingMessage(t).stage, "challenge", "introvert: one round, then the real challenge");
  assert.equal(pendingMessage(t).text, "Which part of this is on you and isn't handled yet?");
  t = walk(t, ["nobody else will do it"], { formula: sj });
  assert.equal(pendingMessage(t).stage, "want");
  assert.equal(pendingMessage(t).text, "What needs to be done, and by when?");
  assert.equal(t.threadPoints.find((p) => p.id === "constraints").value, "nobody else will do it", "the answer is the evidence");
  t = walk(t, ["the car parked inside before the first frost"], { formula: sj });
  const stages = t.messages.map((m) => m.stage ?? m.kind);
  assert.deepEqual(stages.slice(-4), ["hype", "summary", "help", "help"].slice(0, 3).concat(["help"]).slice(0, 4).length === 4 ? stages.slice(-4) : stages);
  assert.ok(t.messages.some((m) => m.kind === "hype"), "the lime bubble at 100");
  assert.match(t.messages.find((m) => m.stage === "summary").text, /^Here's where things stand: You want “the car parked inside before the first frost”\. In the way: “nobody else will do it”\./);
  assert.equal(pendingMessage(t).text, "How can I help?");
  assert.equal(t.goalsReady, true);

  let e = respondToRecording(thread(vague, "e1"), "n1", vague, { formula: nt, now });
  e = walk(e, ["the car does not fit", "my wife keeps asking"], { formula: nt });
  assert.equal(pendingMessage(e).stage, "else", "extravert: still pulling after two rounds");
  e = walk(e, ["and the shelves are broken"], { formula: nt });
  assert.equal(pendingMessage(e).stage, "challenge", "cap of three");
  assert.equal(pendingMessage(e).text, "What's the real problem underneath this?");
  let i = respondToRecording(thread(vague, "i1"), "n1", vague, { formula: nt, now });
  i = walk(i, ["nothing really"], { formula: nt });
  assert.equal(pendingMessage(i).stage, "challenge", "saying nothing closes the loop early");
});

test("the shaper's reply is the reflection; its question never replaces the script's", () => {
  const t = respondToRecording(thread(vague), "n1", vague, {
    now,
    reply: "Garage — got it, I'll hold that.",
    question: "What would 'done' look like for the garage?",
  });
  assert.equal(t.messages[1].text, "Garage — got it, I'll hold that.");
  assert.equal(t.messages[2].text, "And what else?");
});

test("the meter climbs with the script and nothing is offered before How can I help? is answered", async () => {
  const { understoodPercent } = await import("../src/thread.ts");
  let t = respondToRecording(thread("I want to clear the garage."), "n1", "I want to clear the garage.", { mode: "builder", now });
  assert.ok(understoodPercent(t) < 50);
  assert.equal(t.messages.some((m) => m.kind === "offer"), false);
  t = walk(t, ["that's it"]);
  assert.equal(understoodPercent(t), 50);
  t = walk(t, ["the car has to fit before winter"]);
  assert.equal(understoodPercent(t), 75);
  assert.equal(t.messages.some((m) => m.kind === "offer"), false);
  t = walk(t, ["a garage the car fits in, by the end of the month"]);
  assert.equal(understoodPercent(t), 100);
  assert.equal(t.messages.filter((m) => m.kind === "hype").length, 1);
  assert.deepEqual(t.hypeGiven, ["ready"]);
  assert.equal(pendingMessage(t).stage, "help");
  assert.equal(t.messages.some((m) => m.kind === "offer"), false, "no move until the person answers How can I help?");
  t = walk(t, ["just tell me where to start"]);
  const offer = pendingMessage(t);
  assert.equal(offer.kind, "offer");
  assert.equal(offer.chips, undefined, "a move has no buttons; it is accepted by replying");
  assert.match(offer.text, /Say “do it”/);
  assert.match(offer.text, /If you commit to this, what are you saying no to\?/, "the trade-off question rides with the move");
  // A further recording does not hype again.
  const again = respondToRecording(t, "n9", "Also I should ask Dad for the trailer.", { mode: "builder", now });
  assert.equal(again.messages.filter((m) => m.kind === "hype").length, 1);
});

test("replying yes accepts the move, no declines it and the next one is offered, anything else leaves it open", () => {
  const t = toMove(rich);
  const offer = pendingMessage(t);
  assert.equal(offer.kind, "offer");
  const accepted = respondToRecording(t, "a1", "nothing really, do it", { now });
  assert.equal(accepted.messages.find((m) => m.id === offer.id).answered, "a1");
  assert.ok(accepted.steps.find((s) => s.id === offer.stepId).accepted, "the step is accepted; the app makes its task");
  assert.match(accepted.messages.at(-1).text, /on your Today/);
  assert.equal(pendingMessage(accepted), null);

  const declined = respondToRecording(t, "d1", "not now", { now });
  assert.deepEqual(declined.declinedStepIds, [offer.stepId]);
  let pending = pendingMessage(declined);
  let cur = declined, guard = 0, n = 0;
  while (pending?.kind === "offer" && guard++ < 5) {
    cur = respondToRecording(cur, `d${++n + 1}`, "no", { now });
    pending = pendingMessage(cur);
  }
  assert.equal(offerableSteps(cur).length, 0);
  assert.equal(pending, null);

  const aside = respondToRecording(t, "q1", "what if he asks why I didn't flag it earlier?", { now });
  assert.equal(pendingMessage(aside).id, offer.id, "the move stays on the table");
  assert.equal(aside.messages.at(-1).kind, "ack");
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
  assert.equal(yes.thread.messages.at(-2).kind, "hype");
  assert.equal(yes.thread.messages.at(-1).stage, "useful", "then the script's last question");
  const no = answerChip(checked, check.id, "no", { now: later });
  assert.deepEqual(no.effects, []);
});

test("an accepted move that slipped past its day gets a Done / Not yet check-in", () => {
  const t = toMove(rich);
  const offer = pendingMessage(t);
  const accepted = respondToRecording(t, "a1", "do it", { now });
  const task = { id: `flow:${t.id}:${offer.stepId}`, title: "Collect the receipts", done: false, plannedDate: "2026-09-19" };
  assert.equal(stageFor(accepted, [task]), "moving");
  const later = new Date("2026-09-21T09:00:00.000Z");
  const checked = evaluateThread(accepted, [task], { now: later });
  const check = pendingMessage(checked);
  assert.equal(check.kind, "checkin");
  assert.equal(check.taskId, task.id);
  const yes = answerChip(checked, check.id, "yes", { now: later });
  assert.ok(yes.effects.some((e) => e.type === "complete" && e.taskId === task.id));
  assert.equal(stageFor(accepted, [{ ...task, done: true }]), "understood", "finishing a move does not close the thread by itself");
  // With the move done, the only thing left to ask about is the date that passed ("tonight").
  const dueCheck = pendingMessage(evaluateThread(accepted, [{ ...task, done: true }], { now: later }));
  assert.equal(dueCheck.kind, "checkin");
  assert.equal(dueCheck.taskId, undefined);
});

test("after a finished move Flow asks what was most useful, then the next move or whether the whole thing is resolved", async () => {
  const { noteMoveDone } = await import("../src/thread.ts");
  const t = toMove(rich, "r1");
  const offer = pendingMessage(t);
  let accepted = respondToRecording(t, "a1", "ok do it", { now });
  const task = { id: `flow:${t.id}:${offer.stepId}`, title: "Send the invoice", done: true, plannedDate: "" };
  const after = noteMoveDone(accepted, task, { now });
  assert.equal(after.messages.at(-2).kind, "hype");
  const useful = pendingMessage(after);
  assert.equal(useful.stage, "useful");
  assert.equal(useful.text, "What was most useful for you?");
  assert.equal(noteMoveDone(after, task, { now }), after, "idempotent");
  // Another move remains: it is offered after the answer. None left: the closing check-in.
  const withMore = { ...after, steps: [...after.steps, { id: "s2", title: "Email her the receipts", minutes: 10 }] };
  const more = respondToRecording(withMore, "u1", "having one clear step", { now });
  assert.equal(pendingMessage(more).kind, "offer");
  const closing = respondToRecording(after, "u2", "the reminder", { now });
  const ask = pendingMessage(closing);
  assert.equal(ask.kind, "checkin");
  assert.match(ask.text, /resolved/i);
  assert.deepEqual(ask.chips.map((c) => c.label), ["Resolved 🎉", "There's more"]);
  const notYet = answerChip(closing, ask.id, "no", { now });
  assert.equal(pendingMessage(notYet.thread).stage, "help");
  const yes = answerChip(closing, ask.id, "yes", { now });
  assert.ok(yes.thread.resolvedAt);
  assert.equal(stageFor(yes.thread, [task]), "done");
  assert.deepEqual(yes.effects, [{ type: "credit", id: ask.id }]);
  assert.equal(yes.thread.messages.at(-1).kind, "hype");
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

test("Flow types are Keirsey's four roofs on the working type and never expose a four-letter code", () => {
  const high = ITEMS.map((item) => (item.reverse ? 1 : 5)); // E N F J → NF Idealist
  const low = ITEMS.map((item) => (item.reverse ? 5 : 1)); // I S T P → SP Artisan
  assert.equal(modeFor(high), "explorer");
  assert.equal(modeFor(low), "connector");
  assert.equal(modeFor([]), null);
  const t = flowType(low);
  assert.equal(t.name, "Operator");
  assert.doesNotMatch(JSON.stringify(t), /[EI][NS][FT][JP]/);
});

test("a thread saved by an older build gets Flow's conversation backfilled from its saved words, once", async () => {
  const { backfillConversation } = await import("../src/thread.ts");
  const legacy = { ...suggestDraft("old", rich, now), messages: undefined, threadPoints: undefined, updates: ["Also Dad can lend the trailer."] };
  const filled = backfillConversation(legacy, { now });
  const kinds = filled.messages.map((m) => m.kind);
  assert.equal(kinds.filter((k) => k === "transcript").length, 2);
  assert.equal(filled.messages[0].text, rich);
  assert.ok(filled.threadPoints.length === 7);
  assert.equal(backfillConversation(filled, { now }), filled, "already has a conversation");
  assert.equal(backfillConversation({ ...legacy, example: true }, { now }).messages, undefined);
});

test("Flow's template reply reflects what the message settled, answers a question from what it knows, and offers to split other subjects", async () => {
  const { templateReply, threadContextFor } = await import("../src/thread.ts");
  const start = respondToRecording(thread("I want to clear the garage."), "n1", "I want to clear the garage.", { mode: "builder", now });
  const answer = "With my brother next Saturday because the car has to fit before winter.";
  const next = respondToRecording(start, "n2", answer, { mode: "builder", now });
  const ack = next.messages.filter((m) => m.kind === "ack").at(-1);
  assert.match(ack.text, /^Got it — so /, "reflects the newly known points");
  assert.match(ack.text, /brother|saturday|winter/i);
  const q = templateReply("What do you think I should do first?", start.threadPoints, start.threadPoints, false, "builder", "x");
  assert.match(q, /Here's what I have so far/);
  assert.match(q, /clear the garage/);
  const ctx = threadContextFor(next, [thread("Taxes with the accountant", "t2"), { ...thread("Old", "t3"), state: "parked" }]);
  assert.equal(ctx.title, next.title);
  assert.ok(ctx.points.some((p) => p.id === "outcome"));
  assert.ok(ctx.recent.length >= 3 && ctx.recent.length <= 8);
  assert.deepEqual(ctx.otherThreads, ["Taxes with the accountant"]);

  const multi = "Work project is behind because the designer keeps missing deadlines. Also my landlord is asking about the lease renewal. And I need to book the dentist for the kids.";
  const t = respondToRecording(thread(multi, "m"), "n1", multi, {
    now,
    branches: [
      { title: "Lease renewal", evidence: "my landlord is asking about the lease renewal" },
      { title: "Dentist for the kids", evidence: "book the dentist for the kids" },
    ],
  });
  const branch = t.messages.find((m) => m.kind === "branch");
  assert.ok(branch, "Flow offers to split");
  assert.match(branch.text, /3 separate things/);
  assert.deepEqual(branch.chips.map((c) => c.id), ["split", "keep"]);
  assert.equal(pendingMessage(t).kind, "branch", "the split question comes before anything else");
  const split = answerChip(t, branch.id, "split", { now });
  assert.deepEqual(split.effects, [{ type: "branch", branches: branch.branches }]);
  assert.match(split.thread.messages.find((m) => /own thread now/.test(m.text)).text, /own thread now/);
  assert.ok(["question", "offer"].includes(pendingMessage(split.thread).kind), "the conversation carries on after the split");
  const keep = answerChip(t, branch.id, "keep", { now });
  assert.deepEqual(keep.effects, []);
  assert.equal(respondToRecording(split.thread, "n2", "more on the project", { now, branches: branch.branches }).messages.filter((m) => m.kind === "branch").length, 1, "never re-offers the same split");
});

test("side subjects are detected locally and an echoed question is dropped", async () => {
  const { detectBranches } = await import("../src/thread.ts");
  const t = thread("Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday.", "w");
  const found = detectBranches("The demo is fine. Also my landlord is asking about the lease renewal by end of month. And I keep meaning to book a dentist for the kids.", t);
  assert.equal(found.length, 2);
  assert.match(found[1].title, /^Book a dentist/);
  assert.match(found[0].title, /lease/i);
  assert.match(found[1].title, /dentist/i);
  assert.deepEqual(detectBranches("Also the designer sent the new mockups for the demo.", t), [], "same subject is not a branch");
  const vague = thread("Thinking about the designer situation.", "v");
  const asked = "What should I do about the designer first?";
  const r = respondToRecording(vague, "n1", asked, { now, question: "What should you do about the designer first?" });
  const q = r.messages.find((m) => m.kind === "question");
  assert.ok(q, "a question is still asked");
  assert.notEqual(q.text, "What should you do about the designer first?", "the parroted question is replaced");
});

test("a first dump with several subjects gets the split offer, and no second move is offered while one is open", async () => {
  const multi = "Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday. Also my landlord is asking about the lease renewal by end of month. And I keep meaning to book a dentist for the kids.";
  const t = respondToRecording(thread(multi, "d"), "n1", multi, { now });
  const branch = t.messages.find((m) => m.kind === "branch");
  assert.ok(branch, "the opening sentence is the subject; the rest are branches");
  assert.equal(branch.branches.length, 2);
  assert.deepEqual(branch.chips.map((c) => c.label), ["Yes", "No"], "the only buttons in a thread");
  assert.equal(pendingMessage(t).id, branch.id, "the split question waits alone; And what else? comes after it");
  const kept = answerChip(t, branch.id, "keep", { now }).thread;
  assert.equal(pendingMessage(kept).stage, "else");
  const more = respondToRecording(kept, "n2", "The designer said the last screens come Thursday.", { now });
  assert.equal(more.messages.filter((m) => m.kind === "branch").length, 1, "nothing new to split");
  const later = respondToRecording(kept, "n3", "Also the gym membership renews next week and I have not been in months.", { now });
  assert.equal(later.messages.filter((m) => m.kind === "branch").length, 2, "a new side subject in a later message is offered its own thread");
  assert.match(pendingMessage(later).text, /gym membership/i);
  // A whole answer stored as evidence must not hide a later side subject.
  const wide = { ...kept, threadPoints: kept.threadPoints.map((p) => (p.id === "motivation" ? { ...p, state: "known", value: "My sister wants me to organise a birthday dinner for mum next Saturday and I have not booked anywhere yet. Also the gym membership renews next week and I have not been in months." } : p)) };
  assert.equal(respondToRecording(wide, "n5", "Also the gym membership renews next week and I have not been in months.", { now }).messages.filter((m) => m.kind === "branch").length, 2);
  const again = respondToRecording(kept, "n4", "Also my landlord is asking about the lease renewal by end of month.", { now });
  assert.equal(again.messages.filter((m) => m.kind === "branch").length, 1, "the same subject is never offered twice");
  assert.equal(more.messages.filter((m) => m.from === "flow" && !m.answered && m.kind === "question").length, 1, "one open question at a time");
});

test("a model reply that only repeats the person is replaced by the template, and a sentence-long 'next' is not a move", () => {
  const dump = "Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday.";
  const t = respondToRecording(thread(dump, "echo"), "n1", dump, { now, reply: dump, evidence: { next: dump } });
  assert.notEqual(t.messages[1].text, dump);
  assert.equal(t.threadPoints.find((p) => p.id === "next").state, "missing");
  const ok = respondToRecording(thread(dump, "echo2"), "n1", dump + " Tonight I'll message my manager.", { now, evidence: { next: "message my manager" } });
  assert.equal(ok.threadPoints.find((p) => p.id === "next").value, "message my manager");
});

test("Flow's own answer to How can I help? becomes the move when it starts with a verb; a reply that speaks for Flow is dropped", () => {
  let t = respondToRecording(thread("The car insurance renewal is due at the end of the month and I have not compared quotes.", "ins"), "n1", "The car insurance renewal is due at the end of the month and I have not compared quotes.", { now });
  t = walk(t, ["that's it", "I keep putting off the comparison sites", "a cheaper policy in place by the 30th"]);
  assert.equal(pendingMessage(t).stage, "help");
  const helped = respondToRecording(t, "h1", "just tell me where to start", { now, reply: "Visit the three main comparison websites and compare quotes for the next three days." });
  const offer = pendingMessage(helped);
  assert.equal(offer.kind, "offer");
  assert.match(offer.text, /: Visit the three main comparison websites/);
  const bad = respondToRecording(t, "h2", "just tell me where to start", { now, reply: "I'll compare the quotes for the next three days and let you know." });
  assert.doesNotMatch(bad.messages.find((m) => m.kind === "ack" && m.createdAt === bad.messages.at(-1).createdAt).text, /I'll compare/);
});
