import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMove, moveHeadline } from "../src/thread.ts";
import { whenFromAnswer } from "../src/when.ts";

// Turkish users: the dotted "i" must survive every text transform Flow applies to the person's words.
// Run with LANG=tr_TR.UTF-8 to exercise a Turkish default locale.
test("move text keeps the Latin dotted i under a Turkish locale", () => {
  const text = "I want to call the dentist to book a cleaning tomorrow morning";
  const move = cleanMove(text);
  assert.match(move, /dentist/);
  assert.match(move, /cleaning/);
  assert.doesNotMatch(move, /ı|İ/);
  const headline = moveHeadline({ title: "Call the dentist to book a cleaning", plannedDate: "2026-09-20" }, undefined, new Date(2026, 8, 19, 10));
  assert.equal(headline, "Tomorrow: Call the dentist to book a cleaning");
  assert.equal(whenFromAnswer("TOMORROW MORNING I will", new Date(2026, 8, 19, 10))?.time, "09:00");
});
