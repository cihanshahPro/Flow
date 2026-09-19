import test from "node:test";
import assert from "node:assert/strict";
import {
  ITEMS,
  scoreAnswers,
  suggestedPresentation,
  AREAS,
} from "../src/personality.ts";
test("full instrument uses four items per trait and correctly reverses each keyed item", () => {
  assert.equal(ITEMS.length, 20);
  const counts = {};
  ITEMS.forEach((i) => (counts[i.trait] = (counts[i.trait] || 0) + 1));
  assert.deepEqual(Object.values(counts), [4, 4, 4, 4, 4]);
  const highest = ITEMS.map((i) => (i.reverse ? 1 : 5));
  assert.ok(Object.values(scoreAnswers(highest)).every((v) => v === 5));
  assert.ok(
    Object.values(scoreAnswers(highest.map((v) => 6 - v))).every(
      (v) => v === 1,
    ),
  );
  assert.ok(
    Object.values(scoreAnswers(Array(20).fill(3))).every((v) => v === 3),
  );
});
test("incomplete and invalid responses cannot create a personality profile", () => {
  for (const a of [
    [],
    Array(19).fill(3),
    Array(21).fill(3),
    Array(20).fill(0),
    Array(20).fill(2.5),
    Array(20).fill(NaN),
  ])
    assert.throws(() => scoreAnswers(a));
});
test("presentation is bounded and topic coverage does not depend on personality", () => {
  assert.equal(
    suggestedPresentation(ITEMS.map((i) => (i.reverse ? 1 : 5))),
    "sequence",
  );
  assert.equal(suggestedPresentation(Array(20).fill(3)), "small");
  assert.equal(new Set(AREAS.map((a) => a.id)).size, 6);
});
