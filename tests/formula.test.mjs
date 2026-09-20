import test from "node:test";
import assert from "node:assert/strict";
const {
  ROOFS, STAGES, WEIGHTS, roofFor, dialsFor, formulaFor, formulaFromAnswers, understood, nextStage, wording, formulaPrompt, ELSE_ROUNDS,
} = await import("../src/formula.ts");

const TYPES = ["ESTP","ISTP","ESFP","ISFP","ESTJ","ISTJ","ESFJ","ISFJ","ENFP","INFP","ENFJ","INFJ","ENTJ","INTJ","ENTP","INTP"];

test("Keirsey's rule puts all 16 types under four roofs, four each", () => {
  const byRoof = {};
  for (const t of TYPES) (byRoof[roofFor(t)] ??= []).push(t);
  assert.deepEqual(Object.keys(byRoof).sort(), ["NF","NT","SJ","SP"]);
  for (const list of Object.values(byRoof)) assert.equal(list.length, 4);
  assert.equal(roofFor("ESTP"), "SP");
  assert.equal(roofFor("ISTJ"), "SJ");
  assert.equal(roofFor("ENFP"), "NF");
  assert.equal(roofFor("INTJ"), "NT");
});

test("the dials are the two letters the roof does not use", () => {
  assert.deepEqual(dialsFor("ESTP"), { rhythm: "E", lens: "T" });
  assert.deepEqual(dialsFor("ISFJ"), { rhythm: "I", lens: "F" });
  assert.deepEqual(dialsFor("ENFP"), { rhythm: "E", lens: "P" });
  assert.deepEqual(dialsFor("INTJ"), { rhythm: "I", lens: "J" });
  // roof + dials is unique per type: 16 distinct formulas
  const keys = new Set(TYPES.map((t) => { const f = formulaFor(t); return f.roof + f.rhythm + f.lens; }));
  assert.equal(keys.size, 16);
});

test("questions 1, 2 and 7 are identical for everyone; 3, 4, 6 differ per roof", () => {
  const roofs = Object.values(ROOFS);
  for (const q of ["mind", "else", "help", "useful"]) assert.equal(new Set(roofs.map((r) => r.questions[q])).size, 1, q);
  for (const q of ["challenge", "want", "trade"]) assert.equal(new Set(roofs.map((r) => r.questions[q])).size, 4, q);
  assert.equal(ROOFS.SP.questions.else, "And what else?");
  assert.equal(ROOFS.NF.questions.trade, "If you say yes to this, what are you saying no to?");
});

test("no roof question narrows down or hedges", () => {
  for (const r of Object.values(ROOFS)) for (const q of Object.values(r.questions)) {
    assert.doesNotMatch(q, /exactly|roughly|specifically|which one|when is/i, q);
    assert.ok(q.split("?").length === 2, "one question: " + q);
  }
});

test("the meter needs both the challenge and the want to reach 100", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const facts = { people: "manager", timing: "Friday", dependencies: "designer", motivation: "boss in the room" };
  assert.equal(understood(facts), 50);
  assert.equal(understood({ ...facts, challenge: "looks like it's on me" }), 75);
  assert.equal(understood({ ...facts, challenge: "x", outcome: "credible demo" }), 100);
  assert.equal(understood({ outcome: "   " }), 0);
  // once "And what else?" is exhausted, what is still empty is not in this thread
  assert.equal(understood({ people: "manager" }, { aweDone: true }), 50);
  assert.equal(understood({}, { aweDone: true, challengeAnswered: true, wantAnswered: true }), 100);
});

test("extraverts get three rounds of AWE, introverts one, and it stops when nothing new comes", () => {
  assert.equal(ELSE_ROUNDS.E, 3);
  assert.equal(ELSE_ROUNDS.I, 1);
  const e = formulaFor("ENTJ"), i = formulaFor("INTJ");
  const base = { points: {}, answered: ["mind"], elseAsked: 0 };
  assert.equal(nextStage(base, e), "else");
  assert.equal(nextStage({ ...base, elseAsked: 1 }, e), "else");
  assert.equal(nextStage({ ...base, elseAsked: 1 }, i), "challenge");
  assert.equal(nextStage({ ...base, elseAsked: 1, elseExhausted: true }, e), "challenge");
  assert.equal(nextStage({ ...base, elseAsked: 3 }, e), "challenge");
});

test("the script never skips ahead and nothing is suggested below 100", () => {
  const f = formulaFor("ISTJ");
  const s = { points: { people: "a", timing: "b" }, answered: ["mind"], elseAsked: 1 };
  assert.equal(nextStage(s, f), "challenge");
  s.answered.push("challenge"); s.points.challenge = "c";
  assert.equal(nextStage(s, f), "want");
  s.answered.push("want"); s.points.outcome = "d";
  assert.equal(understood(s.points), 75, "evidence alone");
  // the introvert's one AWE round is done, so the empty points are not in this thread: the meter is full
  assert.equal(nextStage(s, f), "summary");
  s.answered.push("summary");
  assert.equal(nextStage(s, f), "help");
  s.answered.push("help");
  assert.equal(nextStage(s, f), null, "the move is offered in the reply; TRADE waits for acceptance");
  assert.equal(nextStage({ ...s, moveAccepted: true }, f), "trade");
  assert.equal(nextStage({ ...s, answered: [...s.answered, "trade"], moveAccepted: true, moveDone: true }, f), "useful");
});

test("wording follows the roof", () => {
  assert.equal(wording("challenge", "SP"), "What's actually in the way right now?");
  assert.equal(wording("want", "SJ"), "What needs to be done, and by when?");
  assert.equal(wording("summary", "NT"), "Here's the model:");
  assert.equal(STAGES[0], "mind");
});

test("the formula comes straight out of the Mini-IPIP answers", () => {
  const all = (n) => Array(20).fill(n);
  assert.equal(formulaFromAnswers(undefined), null);
  assert.equal(formulaFromAnswers([1, 2]), null);
  const f = formulaFromAnswers(all(5));
  assert.ok(f && ["SP","SJ","NF","NT"].includes(f.roof));
});

test("the prompt carries the whole script and the guardrails", () => {
  const p = formulaPrompt(formulaFor("ENFP"));
  assert.match(p, /Idealist \(ENFP\)/);
  assert.match(p, /abstract words/);
  assert.match(p, /up to 3 rounds/);
  assert.match(p, /smallest first step/);
  assert.match(p, /3 What's the part of this that's weighing on you\?/);
  assert.match(p, /NEVER: invent a question/);
  assert.match(formulaPrompt(null), /Guardian \(ISTJ\)/);
});
