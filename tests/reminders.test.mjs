import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
register("./voice-loader.mjs", import.meta.url);

test("morning reminder defaults to 08:30, uses the next occurrence and names the move", async () => {
  const { planMorning, parseMorning } = await import("../src/services/reminders.ts");
  const early = new Date(2026, 8, 19, 7, 0);
  const late = new Date(2026, 8, 19, 9, 0);
  const a = planMorning("This evening: Draft page 1", undefined, early);
  assert.equal(new Date(a.at).getTime(), new Date(2026, 8, 19, 8, 30).getTime());
  assert.equal(a.title, "Your day");
  assert.equal(a.body, "This evening: Draft page 1");
  assert.equal(new Date(planMorning("x", "07:15", late).at).getTime(), new Date(2026, 8, 20, 7, 15).getTime());
  assert.deepEqual(parseMorning("garbage"), { hour: 8, minute: 30 });
});

test("the evening close comes at 19:00 by default, next occurrence, and invites planning tomorrow", async () => {
  const { planEvening } = await import("../src/services/reminders.ts");
  const afternoon = new Date(2026, 8, 19, 15, 0);
  const e = planEvening(3, undefined, afternoon);
  assert.equal(new Date(e.at).getTime(), new Date(2026, 8, 19, 19, 0).getTime());
  assert.equal(e.title, "Day closed");
  assert.match(e.body, /3 done today\. Plan tomorrow/);
  assert.equal(new Date(planEvening(0, "21:00", new Date(2026, 8, 19, 22, 0)).at).getTime(), new Date(2026, 8, 20, 21, 0).getTime());
});

test("no open move means no morning reminder", async () => {
  const { planMorning } = await import("../src/services/reminders.ts");
  assert.equal(planMorning(undefined, "08:30", new Date()), undefined);
});
