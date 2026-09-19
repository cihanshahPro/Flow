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

test("multiple areas preserve legacy selections and toggle without losing other topics", async () => {
  const { areaSelections, toggleArea, newProfile } =
    await import("../src/personality.ts");
  assert.deepEqual(areaSelections("Build something"), ["Build something"]);
  assert.deepEqual(areaSelections("Later"), []);
  let p = {
    ...newProfile(),
    areas: { work: "Build something", home: "Transport" },
  };
  p = toggleArea(p, "work", "Find work or clients");
  assert.deepEqual(p.areas.work, ["Build something", "Find work or clients"]);
  assert.equal(p.areas.home, "Transport");
  p = toggleArea(p, "work", "Build something");
  assert.deepEqual(p.areas.work, ["Find work or clients"]);
});
test("guide respects an explicit preference and provides all five trait interpretations", async () => {
  const { productivityGuide, obstaclePlan } =
    await import("../src/personality.ts");
  const highest = ITEMS.map((i) => (i.reverse ? 1 : 5));
  const g = productivityGuide(highest, "small");
  assert.equal(g.presentation, "small");
  assert.equal(g.traits.length, 5);
  assert.ok(g.obstacles.includes("Too many directions"));
  assert.equal(productivityGuide([], undefined).traits.length, 0);
  assert.ok(
    obstaclePlan("The task feels too big", "sequence").includes("five minutes"),
  );
  assert.ok(
    obstaclePlan("I need more clarity", "small").includes("missing fact"),
  );
});
