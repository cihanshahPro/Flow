import test from "node:test";
import assert from "node:assert/strict";
import {
  validDate,
  calendarDraft,
  todayTasks,
  validateTask,
} from "../src/model.ts";
const task = {
  id: "1",
  title: "Make a plan",
  topic: "Life",
  minutes: 30,
  done: false,
  plannedDate: "2026-09-20",
  plannedTime: "09:30",
  deadline: "",
  waitingOn: "",
  chaseDate: "",
  notes: "My context",
  createdAt: "2026-09-18",
};
test("validates calendar dates and leap years", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-9-01"), false);
});
test("calendar draft preserves wall time and duration", () => {
  const event = calendarDraft(task);
  assert.equal(event.startDate.getHours(), 9);
  assert.equal(event.startDate.getMinutes(), 30);
  assert.equal(event.endDate - event.startDate, 30 * 60000);
  assert.equal(event.notes, "My context");
});
test("calendar requires explicit scheduling", () =>
  assert.throws(
    () => calendarDraft({ ...task, plannedTime: "" }),
    /planned date and time/,
  ));
test("deadlines do not silently become planned events", () =>
  assert.throws(
    () =>
      calendarDraft({
        ...task,
        plannedDate: "",
        plannedTime: "",
        deadline: "2026-10-08",
      }),
    /planned date/,
  ));
test("rejects bad time and estimates", () => {
  assert.throws(() => validateTask({ ...task, plannedTime: "25:00" }));
  assert.throws(() => validateTask({ ...task, minutes: 0 }));
});
test("time budget excludes future work and completed actions", () => {
  const tasks = [
    { ...task, id: "future" },
    { ...task, id: "now", plannedDate: "2026-09-18" },
    { ...task, id: "done", done: true, plannedDate: "" },
    { ...task, id: "large", minutes: 60, plannedDate: "" },
  ];
  assert.deepEqual(
    todayTasks(tasks, 30, "2026-09-18").map((t) => t.id),
    ["now"],
  );
});
test("urgent deadline ranks ahead of unscheduled work", () =>
  assert.deepEqual(
    todayTasks(
      [
        { ...task, id: "later", plannedDate: "" },
        { ...task, id: "urgent", plannedDate: "", deadline: "2026-09-18" },
      ],
      30,
      "2026-09-18",
    ).map((t) => t.id),
    ["urgent", "later"],
  ));
