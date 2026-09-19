import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: PlanMap } = await import("../src/components/PlanMap.tsx");
const { default: PathRail } = await import("../src/components/PathRail.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const direction = {
  directionId: "work:Build something",
  areaId: "work",
  choice: "Build something",
};
const profile = {
  version: 1,
  answers: [],
  stage: "guide",
  areaIndex: 0,
  areas: { work: ["Build something", "Find work or clients"] },
  focus: "Work & making: Build something",
};
const makeTask = (id, patch = {}) => ({
  id,
  title: "Build the first screen",
  topic: "Work",
  minutes: 10,
  done: false,
  plannedDate: "",
  plannedTime: "",
  deadline: "",
  waitingOn: "",
  chaseDate: "",
  notes: "",
  createdAt: "2026-09-18T12:00:00Z",
  ...patch,
});
function textOf(view) {
  return view.root
    .findAllByType("Text")
    .map((text) => text.children.join(""))
    .join("\n");
}
async function mount(Component, props) {
  let view;
  await act(async () => {
    view = renderer.create(React.createElement(Component, props));
  });
  return view;
}
const base = {
  profile,
  notes: [],
  drafts: [],
  tasks: [],
  onOpenTask() {},
  onOpenDraft() {},
  onOpenNote() {},
  onCapture() {},
};

test("the path always exposes all four stages with a single current position, without goal percentages", async () => {
  const view = await mount(PathRail, { stage: 2 });
  const text = textOf(view);
  for (const title of ["Set up", "Shape a plan", "Take a step", "Check in"])
    assert.match(text, new RegExp(title));
  const labels = view.root
    .findAllByType("View")
    .map((node) => node.props.accessibilityLabel)
    .filter(Boolean);
  assert.equal(
    labels.filter((label) => label.includes("You are here")).length,
    1,
  );
  assert.equal(
    labels.filter((label) => label.includes("Passed in this cycle")).length,
    2,
  );
  assert.doesNotMatch(text, /%/);
  assert.equal(view.root.findAllByType("Pressable").length, 0);
  await act(async () => view.unmount());
});

test("a plan owns its exact task ID and original note once, including IDs with colons", async () => {
  const source = {
    id: "note:source:1",
    title: "Portfolio thought",
    text: "Build a demo",
    createdAt: "2026-09-18T12:00:00Z",
    direction,
  };
  const draft = {
    id: source.id,
    title: "My portfolio demo",
    topic: "Work",
    source: source.text,
    updates: [],
    state: "draft",
    createdAt: source.createdAt,
    steps: [
      {
        id: "step:part:1",
        title: "Build the first screen",
        minutes: 10,
        accepted: true,
      },
    ],
  };
  const task = makeTask(`flow:${draft.id}:step:part:1`);
  let openedTask, openedDraft, openedNote;
  const view = await mount(PlanMap, {
    ...base,
    notes: [source],
    drafts: [draft],
    tasks: [task],
    currentTaskId: task.id,
    onOpenTask: (value) => {
      openedTask = value;
    },
    onOpenDraft: (value) => {
      openedDraft = value;
    },
    onOpenNote: (value) => {
      openedNote = value;
    },
  });
  const buttons = view.root.findAllByType("Pressable");
  const taskButtons = buttons.filter(
    (node) =>
      node.props.accessibilityLabel === "Open step: Build the first screen",
  );
  assert.equal(taskButtons.length, 1);
  assert.equal(
    buttons.filter((node) =>
      node.props.accessibilityLabel.startsWith("Open saved thought:"),
    ).length,
    0,
  );
  assert.match(textOf(view), /Work & making/);
  assert.match(textOf(view), /YOUR CURRENT STEP/);
  assert.doesNotMatch(textOf(view), /Other saved work/);
  await act(async () => taskButtons[0].props.onPress());
  await act(async () =>
    buttons
      .find(
        (node) =>
          node.props.accessibilityLabel === "Review plan: My portfolio demo",
      )
      .props.onPress(),
  );
  await act(async () =>
    buttons
      .find(
        (node) =>
          node.props.accessibilityLabel ===
          "Original thought for My portfolio demo",
      )
      .props.onPress(),
  );
  assert.equal(openedTask, task);
  assert.equal(openedDraft, draft);
  assert.equal(openedNote, source);
  await act(async () => view.unmount());
});

test("waiting, deferred, blocked, completed and check-in steps retain truthful labels and dates", async () => {
  const tasks = [
    makeTask("waiting", {
      title: "Wait for a reply",
      followUp: "waiting",
      waitingOn: "Sam",
      chaseDate: "2099-10-10",
    }),
    makeTask("later", {
      title: "Work on it later",
      plannedDate: "2099-10-11",
      plannedTime: "14:30",
    }),
    makeTask("blocked", {
      title: "Resolve an obstacle",
      followUp: "blocked",
      chaseDate: "2001-10-10",
    }),
    makeTask("done", { title: "A completed step", done: true }),
    makeTask("check-in", {
      title: "A step to review",
      done: true,
      completedAt: "2026-09-18T12:00:00Z",
    }),
  ];
  const view = await mount(PlanMap, {
    ...base,
    profile: { ...profile, areas: {} },
    tasks,
  });
  const text = textOf(view);
  assert.match(text, /Other saved work/);
  assert.match(text, /Waiting on Sam · Check in/);
  assert.match(text, /For later ·.*2099 at 14:30/);
  assert.match(text, /Blocked · Follow-up due/);
  assert.match(text, /Done · 10 min/);
  assert.match(text, /Step done · Check-in needed/);
  assert.equal(
    view.root
      .findAllByType("Pressable")
      .filter((node) => node.props.accessibilityLabel.startsWith("Open step:"))
      .length,
    5,
  );
  await act(async () => view.unmount());
});

test("empty interests do not fabricate plans and share one targeted capture action", async () => {
  let captured;
  const view = await mount(PlanMap, {
    ...base,
    onCapture: (value) => {
      captured = value;
    },
  });
  assert.equal(textOf(view).match(/No plan yet/g).length, 2);
  const buttons = view.root.findAllByType("Pressable");
  assert.equal(buttons.length, 1);
  await act(async () => buttons[0].props.onPress());
  assert.equal(captured.directionId, direction.directionId);
  await act(async () => view.unmount());
});

test("follow-up recordings stay under their plan and do not appear again as unlinked thoughts", async () => {
  const draft = {
    id: "plan",
    title: "A continuing plan",
    topic: "Work",
    source: "The first thought",
    updates: [],
    state: "draft",
    createdAt: "2026-09-18T12:00:00Z",
    steps: [],
    direction,
    sourceNoteIds: ["update-by-list"],
  };
  const note = (id, patch = {}) => ({
    id,
    title: id,
    text: "An update",
    audioUri: `file://${id}.m4a`,
    createdAt: draft.createdAt,
    ...patch,
  });
  const notes = [
    note("plan"),
    note("update-by-link", { planId: "plan" }),
    note("update-by-list"),
  ];
  const view = await mount(PlanMap, { ...base, drafts: [draft], notes });
  const labels = view.root
    .findAllByType("Pressable")
    .map((node) => node.props.accessibilityLabel);
  assert.equal(
    labels.filter((label) => label.startsWith("Original thought for")).length,
    1,
  );
  assert.equal(
    labels.filter((label) => /^Update \d+ for/.test(label)).length,
    2,
  );
  assert.equal(
    labels.filter((label) => label.startsWith("Open saved thought:")).length,
    0,
  );
  assert.doesNotMatch(textOf(view), /Other saved work/);
  await act(async () => view.unmount());
});

test("parked plans remain visible, unchosen drafts need review, and legacy actions stay reachable", async () => {
  const draft = (id, state) => ({
    id,
    title: id,
    state,
    source: "Saved thought",
    topic: "Ideas",
    createdAt: "2026-09-18T12:00:00Z",
    updates: [],
    steps: [],
  });
  const example = {
    ...draft("example", "draft"),
    example: true,
    steps: [{ id: "1", title: "Example action", minutes: 10 }],
  };
  const view = await mount(PlanMap, {
    ...base,
    profile: { ...profile, areas: {} },
    drafts: [
      draft("A parked plan", "parked"),
      draft("An unchosen draft", "draft"),
      example,
    ],
    tasks: [
      makeTask("legacy", { title: "My older action" }),
      makeTask("flow:example:1", { title: "Example action" }),
    ],
  });
  const text = textOf(view);
  assert.match(text, /Parked plan/);
  assert.match(text, /Needs review/);
  assert.match(text, /My older action/);
  assert.doesNotMatch(text, /Example action/);
  await act(async () => view.unmount());
});
