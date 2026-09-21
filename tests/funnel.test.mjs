import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Funnel, PLATE_QUESTIONS, FIRST_PROMPT } = await import("../src/components/Funnel.tsx");
const { default: Profile } = await import("../src/components/Profile.tsx");
const { default: Progress } = await import("../src/components/Progress.tsx");
const { newProfile, ITEMS, FUNNEL_VERSION } = await import("../src/personality.ts");
const { newProgress } = await import("../src/progress.ts");
const { suggestDraft } = await import("../src/drafts.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const labels = (view) => view.root.findAllByType("Pressable").map((n) => n.props.accessibilityLabel).filter(Boolean);
const textOf = (view) => JSON.stringify(view.toJSON());
const press = (view, label) => {
  const node = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === label);
  assert.ok(node, `missing ${label}`);
  assert.ok(!node.props.disabled, `${label} is disabled`);
  return act(async () => node.props.onPress());
};
async function render(element) {
  let view;
  await act(async () => {
    view = renderer.create(element);
  });
  return view;
}

test("new people get value first: welcome, connect the calendar, then the first recording — no test in the way", async () => {
  let profile = newProfile();
  let step = "intro";
  const finished = [];
  const recorded = [];
  let connected = 0;
  const props = () => ({
    profile,
    step,
    onStep: (s) => (step = s),
    onSave: async (p) => (profile = p),
    onFinish: async (p) => finished.push(p),
    onRecordFirst: (prompt) => recorded.push(prompt),
    onWriteFirst: () => {},
    onConnectCalendar: async () => (connected++, true),
  });
  const view = await render(React.createElement(Funnel, props()));
  const rerender = () => act(async () => view.update(React.createElement(Funnel, props())));
  assert.match(textOf(view), /Say it once\./);
  assert.deepEqual(labels(view), ["Get started"], "one action, no skip, no test");
  await press(view, "Get started");
  await rerender();
  assert.equal(step, "calendar");
  assert.match(textOf(view), /Let Flow see your week/);
  assert.deepEqual(labels(view), ["Connect calendar", "Not now"]);
  await press(view, "Connect calendar");
  await rerender();
  assert.equal(connected, 1);
  assert.equal(step, "first");
  assert.match(textOf(view), /What's on your mind right now\?/);
  assert.deepEqual(labels(view), ["Talk it out", "Type it"], "two equal ways in");
  assert.match(textOf(view), /Your voice stays on your iPhone\./);
  await press(view, "Talk it out");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].funnelVersion, FUNNEL_VERSION);
  assert.equal(finished[0].answers.length, 0, "the test is not taken yet");
  assert.match(recorded[0], /What's on your mind right now\?/);
  await act(async () => view.unmount());
});

test("the invited test → reveal → five profile questions ends back in the app, and can be left for later", async () => {
  let profile = { ...newProfile(), completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION };
  let step = "test";
  const finished = [];
  let exited = 0;
  const props = () => ({
    profile,
    step,
    onStep: (s) => (step = s),
    onSave: async (p) => (profile = p),
    onFinish: async (p) => finished.push(p),
    onRecordFirst: () => {},
    onWriteFirst: () => {},
    onExit: () => exited++,
  });
  const view = await render(React.createElement(Funnel, props()));
  const rerender = () => act(async () => view.update(React.createElement(Funnel, props())));
  assert.ok(labels(view).includes("Not now"));
  await press(view, "Not now");
  assert.equal(exited, 1);
  for (let i = 0; i < ITEMS.length; i++) {
    await press(view, i % 3 === 0 ? "Very me" : "Mostly");
    await rerender();
  }
  assert.equal(profile.answers.length, ITEMS.length);
  assert.equal(step, "reveal");
  assert.match(textOf(view), /You're a \w+\./);
  await press(view, "Build my profile");
  await rerender();
  assert.equal(step, "plate");
  assert.match(textOf(view), /taking up space in your head/);
  await press(view, "Health");
  await rerender();
  await press(view, "Next");
  await rerender();
  await press(view, "Partner");
  await rerender();
  await press(view, "Next");
  await rerender();
  const next = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Next");
  assert.equal(next.props.disabled, true, "a single-choice question needs an answer");
  await press(view, "Evenings");
  await rerender();
  await press(view, "Next");
  await rerender();
  await press(view, "Not enough time");
  await rerender();
  await press(view, "Next");
  await rerender();
  await press(view, "Yes, this week");
  await rerender();
  await press(view, "Done");
  assert.equal(finished.length, 1, "Done finishes the funnel instead of asking for another thread");
  assert.deepEqual(finished[0].plate, { areas: ["Health"], people: ["Partner"], timeWindow: "Evenings", obstacles: ["Not enough time"], datedSoon: "Yes, this week" });
  assert.equal(finished[0].funnelVersion, FUNNEL_VERSION);
  await act(async () => view.unmount());
});

test("the five profile questions are what the plan says, and the first prompt asks what's on the mind", () => {
  assert.deepEqual(
    PLATE_QUESTIONS.map((q) => q.key),
    ["areas", "people", "timeWindow", "obstacles", "datedSoon"],
  );
  assert.match(FIRST_PROMPT, /^What's on your mind right now\?/);
});

test("Profile shows the Flow type and an editable plate; Progress shows the level with honest counters", async () => {
  const profile = {
    ...newProfile(),
    answers: ITEMS.map((i) => (i.reverse ? 1 : 5)),
    completed: true,
    plate: { areas: ["Work project"], people: ["Boss"], timeWindow: "Mornings", obstacles: ["Money"] },
  };
  const progress = { ...newProgress(), unlockedAt: "2026-09-19T00:00:00Z", completedTaskIds: ["a", "b"], understoodThreadIds: ["t"] };
  const threads = [
    suggestDraft("t", "Call Sam about the invoice. Then email the designer.", new Date()),
    suggestDraft("u", "Call Sam about the invoice.", new Date()),
  ];
  const fb = [];
  const plates = [];
  const view = await render(
    React.createElement(Profile, { profile, threads, notes: [{ id: "f", captureKind: "feedback", title: "x", text: "x", createdAt: "" }], onRetake() {}, onFeedback: (m) => fb.push(m), onPlate: (p) => plates.push(p) }),
  );
  let text = textOf(view);
  assert.match(text, /Work project/);
  assert.match(text, /Boss/);
  assert.match(text, /Sam/);
  assert.match(text, /Mornings/);
  await press(view, "Record feedback");
  assert.deepEqual(fb, ["voice"]);
  assert.ok(!labels(view).includes("Redo the test and profile"), "no personality layer in the way");
  await press(view, "Edit profile");
  await press(view, "Health");
  assert.deepEqual(plates.at(-1).areas, ["Work project", "Health"]);
  await press(view, "Evenings");
  assert.equal(plates.at(-1).timeWindow, "Evenings");
  await act(async () => view.unmount());

  const prog = await render(React.createElement(Progress, { progress, threads }));
  text = textOf(prog);
  assert.match(text, /Momentum/);
  assert.match(text, /\["2"\][^]*moves done/);
  assert.match(text, /THE LADDER/);
  assert.match(text, /came up in ","2"," threads/);
  await act(async () => prog.unmount());
});

test("profile completion is one honest number", async () => {
  const { profileProgress } = await import("../src/profile-progress.ts");
  assert.equal(profileProgress(newProfile(), []).percent, 0);
  const connected = newProfile();
  assert.equal(profileProgress(connected, [], true).percent, 40, "the calendar is the big piece");
  assert.equal(profileProgress(connected, [], false).next, "Calendar connected");
  const full = { ...connected, plate: { areas: ["Health"], people: ["Partner"], timeWindow: "Evenings", obstacles: ["Money"], datedSoon: "Not really" } };
  assert.equal(profileProgress(full, [], true).percent, 90);
  assert.equal(profileProgress(full, [{ ...suggestDraft("t", "Fix the tap.", new Date()), messages: [{ id: "m", from: "you", kind: "transcript", text: "x", createdAt: "" }] }], true).percent, 100);
  assert.equal(profileProgress(full, [], true).next, "First thread");
});
