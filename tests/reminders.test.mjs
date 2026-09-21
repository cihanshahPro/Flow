import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
register("./voice-loader.mjs", import.meta.url);
const { planReminders, MAX_REMINDERS } = await import("../src/services/reminders.ts");
const { respondToRecording, answerChip, pendingMessage } = await import("../src/thread.ts");
const { suggestDraft } = await import("../src/drafts.ts");

const now = new Date("2026-09-19T15:00:00.000Z");
const dated = "I want to send the invoice to Sam before Friday because rent is due.";

test("a thread with a future date gets one reminder the morning after that date", () => {
  const t = respondToRecording(suggestDraft("t", dated, now), "n1", dated, { now });
  const answered = { ...t, messages: t.messages.map((m) => ({ ...m, answered: m.answered ?? "x" })) };
  const plan = planReminders([answered], [], now);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "flow-thread-t-2026-09-25");
  assert.match(plan[0].at, /^2026-09-26T/);
  assert.match(plan[0].body, /Quick check-in/);
});

test("an open question means a single nudge, and parked or resolved threads get nothing", () => {
  const t = respondToRecording(suggestDraft("q", dated, now), "n1", dated, { now });
  assert.equal(pendingMessage(t).kind, "question");
  const plan = planReminders([t, { ...t, id: "p", state: "parked" }, { ...t, id: "r", resolvedAt: now.toISOString() }], [], now);
  assert.deepEqual(plan.map((r) => r.id), ["flow-thread-q-pending"]);
});

test("reminders are capped and ordered by time", () => {
  const threads = Array.from({ length: 12 }, (_, i) => {
    const text = `I want to send invoice ${i} to Sam before Friday because rent is due.`;
    const t = respondToRecording(suggestDraft(`m${i}`, text, now), `n${i}`, text, { now });
    return { ...t, messages: t.messages.map((m) => ({ ...m, answered: "x" })) };
  });
  const plan = planReminders(threads, [], now);
  assert.equal(plan.length, MAX_REMINDERS);
  assert.deepEqual([...plan.map((r) => r.at)].sort(), plan.map((r) => r.at));
});

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
