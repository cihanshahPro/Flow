import test from "node:test";
import assert from "node:assert/strict";
import { cleanMove, moveHeadline } from "../src/thread.ts";

test("cleanMove strips filler and time words", () => {
  assert.equal(cleanMove("I'll draft page 1 of the quarterly report tonight."), "Draft page 1 of the quarterly report");
  assert.equal(cleanMove("First I'm going to email Ali the numbers tomorrow morning"), "Email Ali the numbers");
});

test("cleanMove caps length at a word boundary", () => {
  const out = cleanMove("write the whole quarterly report for the board including every appendix and chart", 40);
  assert.ok(out.length <= 40);
  assert.ok(out.endsWith("…"));
});

test("cleanMove keeps the sentence when cleaning would empty it", () => {
  assert.equal(cleanMove("Tonight"), "Tonight");
});

test("moveHeadline puts the time first", () => {
  const now = new Date(2026, 8, 19, 10, 0);
  const task = { title: "I will draft page 1 of the quarterly report", plannedDate: "2026-09-19" };
  assert.equal(moveHeadline(task, "Evenings", now), "This evening: Draft page 1 of the quarterly report");
  assert.equal(moveHeadline({ ...task, plannedDate: "2026-09-20" }, "Evenings", now), "Tomorrow: Draft page 1 of the quarterly report");
});

test("cleanMove drops a trailing deadline and never ends on a dangling word", () => {
  assert.equal(cleanMove("Finish the quarterly report for my boss by Friday"), "Finish the quarterly report for my boss");
  assert.ok(!/\b(?:by|for|to|the|of|my)…$/i.test(cleanMove("Finish the quarterly report for my boss and then send it to everyone on the team", 40)));
});

test("cleanMove trims a clipped trailing 'by…'", () => {
  assert.equal(cleanMove("Finish the quarterly report for my boss by…"), "Finish the quarterly report for my boss");
});
