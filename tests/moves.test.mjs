import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
register("./processing-loader.mjs", import.meta.url);
const { harness } = await import("./processing-mocks.mjs");
const { replanConflicts, moveToTomorrow, tickMove, editMove } = await import("../src/services/moves.ts");
const { lockTomorrow, startDay } = await import("../src/services/tomorrow.ts");
const { isQuickLine } = await import("../src/intake.ts");

// A Monday morning; events in local time.
const now = new Date(2026, 8, 21, 8, 0);
const task = (id, extra = {}) => ({ id, title: id, topic: "Life", minutes: 20, done: false, plannedDate: "", plannedTime: "", deadline: "", waitingOn: "", chaseDate: "", notes: "", createdAt: "", ...extra });
const iso = (h, m = 0, d = 21) => new Date(2026, 8, d, h, m).toISOString();
function reset() {
  harness.reset?.();
  harness.tasks = [];
  harness.events = [];
  harness.calendarWrites = [];
  harness.records = [];
  harness.drafts = [];
}

test("a calendar event that lands on a Flow block moves the block to the next gap that day", async () => {
  reset();
  harness.tasks = [task("a", { title: "Call the DUI lawyer", plannedDate: "2026-09-21", plannedTime: "10:00", eventId: "evt-a" })];
  harness.events = [
    { id: "evt-a", calendarId: "c", title: "Call the DUI lawyer", start: iso(10), end: iso(10, 20), allDay: false, mine: true, ref: "a" },
    { id: "dentist", calendarId: "c", title: "Dentist", start: iso(9, 45), end: iso(10, 30), allDay: false },
  ];
  const moved = await replanConflicts(now);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].plannedDate, "2026-09-21");
  assert.notEqual(moved[0].plannedTime, "10:00", "not where the dentist is");
  assert.ok(moved[0].plannedTime >= "10:30", `after the dentist, got ${moved[0].plannedTime}`);
  assert.ok(harness.calendarWrites.some((w) => w.kind === "event" && w.ref === "a"), "the phone's event is rewritten");
  // Nothing to do the second time.
  harness.events = [harness.events[1], { id: "evt-a", calendarId: "c", title: "x", start: new Date(`2026-09-21T${moved[0].plannedTime}:00`).toISOString(), end: new Date(new Date(`2026-09-21T${moved[0].plannedTime}:00`).getTime() + 20 * 60000).toISOString(), allDay: false, mine: true, ref: "a" }];
  assert.equal((await replanConflicts(now)).length, 0);
});

test("tick, tomorrow and edit go through one path and keep the phone in step", async () => {
  reset();
  harness.tasks = [task("a", { title: "Compare quotes", plannedDate: "2026-09-21", plannedTime: "10:00", eventId: "evt-a" })];
  const done = await tickMove(harness.tasks[0], now);
  assert.equal(done.done, true);
  assert.equal(harness.tasks[0].done, true);
  const back = await moveToTomorrow({ ...done, done: false }, now);
  assert.equal(back.plannedDate, "2026-09-22");
  assert.ok(back.plannedTime, "placed in a gap on Tuesday");
  const edited = await editMove(back, { plannedDate: "", plannedTime: "" }, now);
  assert.equal(edited.eventId, undefined, "an unplaced move leaves the calendar");
  assert.ok(harness.calendarWrites.some((w) => w.kind === "remove"));
});

test("lock in tomorrow: routines become blocks, kept leftovers move, typed lines take gaps, and the day is recorded", async () => {
  reset();
  const sunday = new Date(2026, 8, 20, 20, 0);
  harness.tasks = [task("left", { title: "Compare quotes", plannedDate: "2026-09-20", plannedTime: "10:00" }), task("drop", { title: "Old thing", plannedDate: "2026-09-19" }), task("keep", { title: "Call the lawyer", plannedDate: "2026-09-21", plannedTime: "11:00" }), task("unkeep", { title: "Not tomorrow", plannedDate: "2026-09-21", plannedTime: "15:00" })];
  const routines = [{ id: "exercise", title: "Exercise", time: "07:00", minutes: 20, days: [0, 1, 2, 3, 4, 5, 6], on: true }, { id: "read", title: "Read", time: "21:30", minutes: 15, days: [1, 2, 3, 4, 5], on: false }];
  const closure = await lockTomorrow({ keep: ["keep"], carry: ["left"], added: ["Book the dentist", "Email Ali"], routines }, sunday);
  assert.equal(closure, "Tomorrow is set · 4 moves · 1 routine · 1 from today. Nothing to hold tonight.");
  const byId = Object.fromEntries(harness.tasks.map((t) => [t.id, t]));
  assert.equal(byId["routine:exercise:2026-09-21"].plannedTime, "07:00");
  assert.equal(byId.left.plannedDate, "2026-09-21");
  assert.equal(byId.drop.plannedDate, "2026-09-19", "left behind, untouched");
  assert.equal(byId.unkeep.plannedDate, "", "unticked moves come off tomorrow");
  const added = harness.tasks.filter((t) => t.id.startsWith("flow:day:2026-09-21:"));
  assert.equal(added.length, 2);
  assert.notEqual(added[0].plannedTime, added[1].plannedTime, "two lines, two gaps");
  assert.equal((await import("./processing-mocks.mjs")).harness.records.find((r) => r.kind === "dayplan")?.id, "2026-09-21");
  // Locking again is idempotent for the routine and the typed lines.
  await lockTomorrow({ keep: ["keep", "left"], carry: [], added: ["Book the dentist"], routines }, sunday);
  assert.equal(harness.tasks.filter((t) => t.id === "routine:exercise:2026-09-21").length, 1);
  assert.equal(harness.tasks.filter((t) => t.id.startsWith("flow:day:2026-09-21:")).length, 2);
});

test("a day nobody planned still gets its routine blocks, once", async () => {
  reset();
  harness.records = [{ kind: "prefs", id: "routines", payload: [{ id: "exercise", title: "Exercise", time: "07:00", minutes: 20, days: [1], on: true }] }];
  assert.equal(await startDay(now), 1);
  assert.equal(await startDay(now), 0);
  assert.equal(harness.tasks[0].routineId, "exercise");
});

test("quick lines are one short thing; dumps are not", () => {
  assert.ok(isQuickLine("Call the dentist tomorrow"));
  assert.ok(isQuickLine("email Ali about the free app by Friday"));
  assert.ok(!isQuickLine("Call the dentist tomorrow. Then I need to sort the insurance."));
  assert.ok(!isQuickLine("Right now I have a lot of stuff on my mind, starting with the lawyer and also the app portfolio and the landlord"));
});
