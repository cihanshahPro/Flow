import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { proposeTomorrow, routinesOn, routineTask, closureLine, morningLine, ROUTINE_SUGGESTIONS, tomorrowOf } = await import("../src/tomorrow.ts");
const { default: PlanTomorrow } = await import("../src/components/PlanTomorrow.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A Saturday afternoon; tomorrow is Sunday 20.
const now = new Date(2026, 8, 19, 15, 0);
const task = (id, extra = {}) => ({ id, title: id, topic: "Life", minutes: 20, done: false, plannedDate: "", plannedTime: "", deadline: "", waitingOn: "", chaseDate: "", notes: "", createdAt: "", ...extra });
const textOf = (view) => JSON.stringify(view.toJSON());
async function render(element) {
  let view;
  await act(async () => {
    view = renderer.create(element);
  });
  return view;
}

test("the proposal: tomorrow's events, watch-outs, routines on that weekday, its moves, today's leftovers, chases", () => {
  const events = [
    { id: "court", calendarId: "c", title: "Court hearing", start: "2026-09-20T14:00:00.000Z", end: "2026-09-20T15:00:00.000Z", allDay: false },
    { id: "mine", calendarId: "c", title: "Call the DUI lawyer", start: "2026-09-20T16:00:00.000Z", end: "2026-09-20T16:20:00.000Z", allDay: false, mine: true, ref: "a" },
  ];
  const tasks = [
    task("a", { plannedDate: "2026-09-20", plannedTime: "12:00" }),
    task("left", { plannedDate: "2026-09-19", plannedTime: "10:00" }),
    task("old", { plannedDate: "2026-09-17" }),
    task("done", { plannedDate: "2026-09-19", done: true }),
    task("chase", { kind: "waiting", waitingOn: "the lawyer", chaseDate: "2026-09-20" }),
    task("later", { later: true, plannedDate: "2026-09-20" }),
    task("routine:read:2026-09-20", { routineId: "read", plannedDate: "2026-09-20" }),
  ];
  const routines = ROUTINE_SUGGESTIONS.map((r) => (r.id === "exercise" || r.id === "emails" ? { ...r, on: true } : r));
  const p = proposeTomorrow(events, tasks, routines, now);
  assert.equal(p.date, "2026-09-20");
  assert.deepEqual(p.events.map((e) => e.title), ["Court hearing"], "Flow's own events are not on the table");
  assert.equal(p.watch.length, 1, "the hearing is a watch-out");
  assert.deepEqual(p.routines.map((r) => r.id), ["exercise"], "emails is weekdays only; Sunday has exercise");
  assert.deepEqual(p.moves.map((t) => t.id), ["a"], "routine blocks and later items are not moves to decide on");
  assert.deepEqual(p.carry.map((t) => t.id).sort(), ["left", "old"], "unfinished dated moves from today and before");
  assert.deepEqual(p.chases.map((t) => t.id), ["chase"]);
  assert.ok(p.freeMinutes > 0);
});

test("routines become tickable tasks with a stable id; the closure and morning lines read plainly", () => {
  const r = { ...ROUTINE_SUGGESTIONS[0], on: true };
  const t = routineTask(r, "2026-09-20", now);
  assert.equal(t.id, "routine:exercise:2026-09-20");
  assert.equal(t.plannedTime, "07:00");
  assert.equal(t.routineId, "exercise");
  assert.deepEqual(routinesOn([r, { ...ROUTINE_SUGGESTIONS[2], on: true }], "2026-09-21").map((x) => x.id), ["exercise", "emails"], "Monday has both, in time order");
  assert.equal(closureLine({ moves: 3, routines: 2, carried: 1 }), "Tomorrow is set · 3 moves · 2 routines · 1 from today. Nothing to hold tonight.");
  assert.equal(closureLine({ moves: 1, routines: 0, carried: 0 }), "Tomorrow is set · 1 move. Nothing to hold tonight.");
  const line = morningLine([{ id: "e", calendarId: "c", title: "Court", start: "2026-09-20T14:00:00.000Z", end: "2026-09-20T15:00:00.000Z", allDay: false }], [t, task("b", { plannedDate: "2026-09-20", plannedTime: "10:00" })], "2026-09-20");
  assert.equal(line, "1 event · 2 moves · first: Exercise at 07:00");
  assert.equal(tomorrowOf(now), "2026-09-20");
});

test("the Tomorrow screen: rows with checks, a line to add, one button; the decision carries what was kept", async () => {
  const p = {
    date: "2026-09-21",
    events: [{ id: "court", calendarId: "c", title: "Court hearing", start: "2026-09-21T14:00:00.000Z", end: "2026-09-21T15:00:00.000Z", allDay: false }],
    watch: [{ kind: "important", date: "2026-09-21", title: "Court hearing", note: "10am", eventId: "court" }],
    routines: [],
    moves: [task("a", { title: "Call the DUI lawyer", plannedDate: "2026-09-21", plannedTime: "12:00", area: "Legal & admin" })],
    carry: [task("left", { title: "Compare insurance quotes", plannedDate: "2026-09-20" })],
    chases: [task("chase", { title: "His answer", kind: "waiting", waitingOn: "the lawyer", chaseDate: "2026-09-21" })],
    freeMinutes: 300,
  };
  const routines = ROUTINE_SUGGESTIONS.map((r) => (r.id === "exercise" ? { ...r, on: true } : r));
  const locked = [];
  const view = await render(React.createElement(PlanTomorrow, { proposal: p, routines, onLock: (d) => locked.push(d), onOpenMove() {}, onBack() {} }));
  const text = textOf(view);
  assert.match(text, /"Tomorrow"/);
  assert.match(text, /Monday 21 · 1 event · 5h free/);
  for (const label of ["CALENDAR", "ROUTINE", "MOVES", "CHASE TOMORROW"]) assert.match(text, new RegExp(`"${label}"`));
  assert.match(text, /"watch"/);
  assert.match(text, /not done today/);
  const find = (label) => view.root.findAll((n) => n.props.accessibilityLabel === label)[0];
  await act(async () => find("Skip Exercise tomorrow").props.onPress());
  await act(async () => find("Keep Emails tomorrow").props.onPress());
  await act(async () => find("Leave Compare insurance quotes").props.onPress());
  const input = view.root.findAll((n) => n.props.accessibilityLabel === "Add a move")[0];
  await act(async () => input.props.onChangeText("Book the dentist"));
  await act(async () => input.props.onSubmitEditing());
  assert.match(textOf(view), /"Book the dentist"/);
  await act(async () => find("Lock in tomorrow").props.onPress());
  assert.equal(locked.length, 1);
  const d = locked[0];
  assert.deepEqual(d.keep, ["a"]);
  assert.deepEqual(d.carry, [], "the leftover was left behind");
  assert.deepEqual(d.added, ["Book the dentist"]);
  assert.equal(d.routines.find((r) => r.id === "exercise").on, false);
  assert.equal(d.routines.find((r) => r.id === "emails").on, true);
  assert.ok(d.routines.find((r) => r.id === "emails").days.includes(1));
  await act(async () => view.unmount());
});
