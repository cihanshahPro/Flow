import test from "node:test";
import assert from "node:assert/strict";
import { streakDays } from "../src/streak.ts";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const done = (iso) => ({ done: true, completedAt: iso });
const now = new Date(2026, 8, 19, 15);

test("no finished moves means no streak", () => {
  assert.equal(streakDays([], now), 0);
  assert.equal(streakDays([{ done: false }], now), 0);
});

test("consecutive days count, several moves a day count once", () => {
  const tasks = [done(at(2026, 9, 19, 9)), done(at(2026, 9, 19, 11)), done(at(2026, 9, 18)), done(at(2026, 9, 17))];
  assert.equal(streakDays(tasks, now), 3);
});

test("today not done yet keeps yesterday's run alive", () => {
  assert.equal(streakDays([done(at(2026, 9, 18)), done(at(2026, 9, 17))], now), 2);
});

test("a missed day resets the run", () => {
  assert.equal(streakDays([done(at(2026, 9, 17)), done(at(2026, 9, 16))], now), 0);
  assert.equal(streakDays([done(at(2026, 9, 19)), done(at(2026, 9, 17))], now), 1);
});
