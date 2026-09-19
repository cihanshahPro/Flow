import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { localDate } from "../src/model.ts";
import {
  taskState,
  taskIsDue,
  completeTask,
  reviewTask,
  resumeTask,
  postponeTask,
  holdTask,
} from "../src/task-flow.ts";

const task = (extra = {}) => ({
  id: "flow:file:///saved.m4a:ai-0",
  title: "Call the project contact",
  topic: "Work",
  minutes: 15,
  done: false,
  plannedDate: "",
  plannedTime: "",
  deadline: "2026-10-12",
  waitingOn: "",
  chaseDate: "",
  notes: "My original details",
  createdAt: "2026-09-18T12:00:00Z",
  contactName: "Alex",
  phone: "+1 212 555 0100",
  email: "alex@example.com",
  direction: {
    directionId: "work:Build something",
    areaId: "work",
    choice: "Build something",
  },
  ...extra,
});

test("task availability distinguishes future work, held reviews, and completed check-ins", () => {
  const today = "2026-09-18";
  assert.equal(taskState(task(), today), "ready");
  assert.equal(taskState(task({ plannedDate: "2026-09-19" }), today), "later");
  assert.equal(
    taskState(task({ waitingOn: "Alex", chaseDate: today }), today),
    "waiting",
  );
  assert.equal(
    taskIsDue(task({ waitingOn: "Alex", chaseDate: today }), today),
    true,
  );
  assert.equal(
    taskIsDue(task({ followUp: "blocked", chaseDate: "2026-09-19" }), today),
    false,
  );
  assert.equal(
    taskState(
      task({ followUp: "blocked", waitingOn: "A reply", chaseDate: today }),
      today,
    ),
    "blocked",
  );
  assert.equal(taskIsDue(task({ followUp: "waiting" }), today), false);
  assert.equal(taskState(task({ done: true }), today), "done");
  assert.equal(
    taskState(task({ done: true, completedAt: "2026-09-18T14:00:00Z" }), today),
    "check-in",
  );
  assert.equal(
    taskIsDue(
      task({ done: true, followUp: "waiting", chaseDate: today }),
      today,
    ),
    false,
  );
});

test("complete then review is persistent and idempotent, and never invents goal completion", () => {
  const completed = completeTask(task(), "2026-09-18T14:00:00Z");
  assert.equal(completed.completedAt, "2026-09-18T14:00:00.000Z");
  assert.equal(taskState(JSON.parse(JSON.stringify(completed))), "check-in");
  const reviewed = reviewTask(completed, "2026-09-18T14:01:00Z");
  assert.equal(taskState(reviewed), "done");
  assert.deepEqual(completeTask(reviewed, "2026-09-18T15:00:00Z"), reviewed);
  assert.deepEqual(reviewTask(reviewed, "2026-09-18T15:00:00Z"), reviewed);
  assert.deepEqual(reviewTask(task()), task());
  assert.equal("goalComplete" in reviewed, false);
});

test("postpone, hold and resume keep the same action and supplied contact context", () => {
  const original = task({ plannedDate: "2026-09-18", plannedTime: "09:00" });
  const later = postponeTask(original, "2026-09-25");
  assert.equal(taskState(later, "2026-09-18"), "later");
  assert.equal(later.plannedTime, "");
  const held = holdTask(
    { ...later, waitingOn: "Alex" },
    "waiting",
    "2026-09-21",
  );
  assert.equal(taskState(held, "2026-09-21"), "waiting");
  assert.equal(taskIsDue(held, "2026-09-21"), true);
  const resumed = resumeTask(held, "2026-09-21");
  assert.equal(taskState(resumed, "2026-09-21"), "ready");
  assert.equal(resumed.chaseDate, "");
  assert.equal(resumed.waitingOn, "");
  for (const updated of [later, held, resumed]) {
    for (const key of [
      "id",
      "notes",
      "deadline",
      "phone",
      "email",
      "contactName",
      "direction",
    ])
      assert.deepEqual(updated[key], original[key]);
  }
  assert.deepEqual(
    original,
    task({ plannedDate: "2026-09-18", plannedTime: "09:00" }),
  );
  assert.throws(() => postponeTask(original, "2026-02-30"), /real date/);
  assert.throws(() => holdTask(original, "blocked", ""), /real date/);
});

register("./voice-loader.mjs", import.meta.url);
const { default: TaskDetail } =
  await import("../src/components/TaskDetail.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function editor(initial = task(), overrides = {}) {
  let view;
  const calls = { closed: 0, saved: [], completed: [], calendar: [] };
  const props = {
    task: initial,
    onClose: () => calls.closed++,
    onSave: async (value) => calls.saved.push(value),
    onComplete: async (value) => calls.completed.push(value),
    onCalendar: async (value) => calls.calendar.push(value),
    ...overrides,
  };
  await act(async () => {
    view = renderer.create(React.createElement(TaskDetail, props));
  });
  const button = (label) =>
    view.root
      .findAllByType("Pressable")
      .find((n) => n.props.accessibilityLabel === label);
  return {
    calls,
    view,
    button,
    async tap(label) {
      await act(async () => {
        assert.ok(button(label), `Expected ${label}`);
        await button(label).props.onPress();
      });
    },
    async fill(label, value) {
      await act(async () => {
        view.root
          .findAllByType("TextInput")
          .find((n) => n.props.accessibilityLabel === label)
          .props.onChangeText(value);
      });
    },
    close: () => act(async () => view.unmount()),
  };
}

test("task editor saves waiting review with existing context and no immediate mutation", async () => {
  const initial = task();
  const e = await editor(initial);
  await e.tap("Waiting");
  await e.tap("In 3 days");
  assert.equal(e.calls.saved.length, 0);
  await e.tap("Save changes");
  assert.equal(e.calls.saved.length, 1);
  assert.equal(e.calls.saved[0].followUp, "waiting");
  assert.equal(e.calls.saved[0].id, initial.id);
  assert.deepEqual(e.calls.saved[0].direction, initial.direction);
  assert.equal(e.calls.saved[0].email, initial.email);
  assert.ok(e.calls.saved[0].chaseDate > localDate());
  assert.equal(e.calls.closed, 1);
  await e.close();
});

test("failed save keeps entered wording; cancel leaves persisted task untouched", async () => {
  let fail = true;
  const initial = task();
  const saved = [];
  const e = await editor(initial, {
    onSave: async (value) => {
      if (fail) throw new Error("Storage unavailable. Try again.");
      saved.push(value);
    },
  });
  await e.tap("Edit this step");
  await e.fill("Step", "Email the project contact");
  await e.tap("Save changes");
  assert.equal(e.calls.closed, 0);
  assert.match(JSON.stringify(e.view.toJSON()), /Storage unavailable/);
  assert.equal(
    e.view.root
      .findAllByType("TextInput")
      .find((n) => n.props.accessibilityLabel === "Step").props.value,
    "Email the project contact",
  );
  assert.equal(initial.title, "Call the project contact");
  fail = false;
  await e.tap("Save changes");
  assert.equal(saved[0].title, "Email the project contact");
  assert.equal(e.calls.closed, 1);
  await e.close();

  const canceled = await editor(initial);
  await canceled.tap("Move later");
  await canceled.tap("Close step");
  assert.equal(canceled.calls.saved.length, 0);
  assert.equal(canceled.calls.closed, 1);
  await canceled.close();
});

test("changing one's mind from waiting to ready cannot persist a hidden hold", async () => {
  const e = await editor();
  await e.tap("Waiting");
  await e.fill("Waiting on / obstacle (optional)", "Alex");
  await e.tap("Ready now");
  await e.tap("Save and mark done");
  assert.equal(e.calls.completed.length, 1);
  assert.equal(e.calls.completed[0].waitingOn, "");
  assert.equal(e.calls.completed[0].followUp, undefined);
  await e.close();
});

test("an old waiting action can finish without inventing a review date", async () => {
  const e = await editor(task({ waitingOn: "Alex", chaseDate: "" }));
  await e.tap("Mark step done");
  assert.equal(e.calls.completed.length, 1);
  assert.equal(e.calls.completed[0].chaseDate, "");
  await e.close();
});

test("calendar cancellation is shown truthfully in the open editor", async () => {
  const e = await editor(
    task({ plannedDate: "2099-09-25", plannedTime: "09:00" }),
    {
      onCalendar: async () => "Calendar selection canceled. Nothing was added.",
    },
  );
  await e.tap("Add or update in Calendar");
  assert.equal(e.calls.closed, 0);
  assert.match(JSON.stringify(e.view.toJSON()), /Calendar selection canceled/);
  await e.close();
});

test("calendar receives edited scheduling for the same task and is not called after a failed save", async () => {
  const e = await editor(task(), {
    onSave: async () => {
      throw new Error("Cannot save yet");
    },
  });
  await e.tap("Schedule and contact details");
  await e.fill("Planned date (YYYY-MM-DD)", "2026-09-25");
  await e.fill("Planned time (HH:mm)", "14:30");
  await e.tap("Add or update in Calendar");
  assert.equal(e.calls.calendar.length, 0);
  assert.equal(e.calls.closed, 0);
  await e.close();
  const success = await editor(
    task({ plannedDate: "2099-09-25", plannedTime: "09:00" }),
  );
  await success.tap("Schedule and contact details");
  await success.fill("Planned date (YYYY-MM-DD)", "2099-09-27");
  await success.fill("Planned time (HH:mm)", "14:30");
  await success.tap("Add or update in Calendar");
  assert.equal(success.calls.calendar[0].plannedDate, "2099-09-27");
  assert.equal(success.calls.calendar[0].plannedTime, "14:30");
  assert.equal(success.calls.calendar[0].id, task().id);
  await success.close();
});

test("explicit scheduling after Ready now survives reopening a later, waiting or blocked action", async () => {
  for (const extra of [
    { plannedDate: "2099-09-25", plannedTime: "09:00" },
    {
      followUp: "waiting",
      waitingOn: "Alex",
      chaseDate: "2099-09-25",
      plannedTime: "",
      plannedDate: "",
    },
    {
      followUp: "blocked",
      chaseDate: "2099-09-25",
      plannedTime: "",
      plannedDate: "",
    },
  ]) {
    const e = await editor(task(extra));
    await e.tap("Ready now");
    await e.tap("Schedule and contact details");
    await e.fill("Planned date (YYYY-MM-DD)", "2099-09-27");
    await e.fill("Planned time (HH:mm)", "09:00");
    await e.tap("Save changes");
    assert.equal(e.calls.saved[0].plannedDate, "2099-09-27");
    assert.equal(e.calls.saved[0].plannedTime, "09:00");
    assert.equal(e.calls.saved[0].followUp, undefined);
    assert.equal(e.calls.saved[0].waitingOn, "");
    assert.equal(taskState(e.calls.saved[0]), "later");
    await e.close();
  }
});

test("all editor fields and schedule expander lock while an asynchronous save is pending", async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const e = await editor(task(), { onSave: async () => pending });
  await e.tap("Edit this step");
  await e.tap("Schedule and contact details");
  await e.fill("Step", "Email the project contact");
  await e.tap("Save changes");
  const fields = e.view.root.findAllByType("TextInput");
  assert.ok(fields.length > 3);
  assert.ok(fields.every((field) => field.props.editable === false));
  assert.equal(e.button("Schedule and contact details").props.disabled, true);
  await e.fill("Step", "Should not replace the saving title");
  assert.equal(
    e.view.root
      .findAllByType("TextInput")
      .find((n) => n.props.accessibilityLabel === "Step").props.value,
    "Email the project contact",
  );
  await act(async () => {
    finish();
    await pending;
  });
  assert.equal(e.calls.closed, 1);
  await e.close();
});
