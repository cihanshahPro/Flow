import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Funnel, PLATE_QUESTIONS, firstPrompt } = await import("../src/components/Funnel.tsx");
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

test("the funnel is test → reveal → five profile questions → prompted first thread, with no skip and one primary action per screen", async () => {
  let profile = { ...newProfile(), completed: true, stage: "guide" }; // an older build's profile still gets the whole funnel
  let step = "intro";
  const finished = [];
  const recorded = [];
  const props = () => ({
    profile,
    step,
    onStep: (s) => (step = s),
    onSave: async (p) => (profile = p),
    onFinish: async (p) => finished.push(p),
    onRecordFirst: (prompt) => recorded.push(prompt),
    onWriteFirst: () => {},
  });
  const view = await render(React.createElement(Funnel, props()));
  const rerender = () => act(async () => view.update(React.createElement(Funnel, props())));

  assert.deepEqual(labels(view), ["Start the test"], "intro has exactly one action and no skip");
  assert.doesNotMatch(textOf(view), /TEST 12/);
  await press(view, "Start the test");
  await rerender();
  assert.equal(step, "test");
  assert.ok(!labels(view).some((l) => /skip/i.test(l)), "the test cannot be skipped");
  for (let i = 0; i < ITEMS.length; i++) {
    await press(view, i % 3 === 0 ? "Very me" : "Mostly");
    await rerender();
  }
  assert.equal(profile.answers.length, ITEMS.length);
  assert.equal(step, "reveal");
  assert.match(textOf(view), /You're a \w+\./);
  assert.doesNotMatch(textOf(view), /[EI][NS][FT][JP]/);
  await press(view, "Build my profile");
  await rerender();
  assert.equal(step, "plate");

  // Q1 areas (multi)
  assert.match(textOf(view), /taking up space in your head/);
  await press(view, "Money & bills");
  await rerender();
  await press(view, "Health");
  await rerender();
  assert.deepEqual(profile.plate.areas, ["Money & bills", "Health"]);
  await press(view, "Next");
  await rerender();
  // Q2 people (multi)
  await press(view, "Partner");
  await rerender();
  await press(view, "Next");
  await rerender();
  // Q3 time window (single, required)
  const next = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Next");
  assert.equal(next.props.disabled, true, "a single-choice question needs an answer");
  await press(view, "Evenings");
  await rerender();
  await press(view, "Next");
  await rerender();
  // Q4 obstacles
  await press(view, "Not enough time");
  await rerender();
  await press(view, "Next");
  await rerender();
  // Q5 dated soon
  await press(view, "Yes, this week");
  await rerender();
  await press(view, "Done");
  await rerender();
  assert.equal(step, "first");
  assert.deepEqual(profile.plate, { areas: ["Money & bills", "Health"], people: ["Partner"], timeWindow: "Evenings", obstacles: ["Not enough time"], datedSoon: "Yes, this week" });

  // The first thread is prompted from the profile, not "record whatever".
  assert.match(textOf(view), /Let's start with ","money and bills"/);
  assert.deepEqual(labels(view), ["Record", "or write it down"]);
  await press(view, "Record");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].funnelVersion, FUNNEL_VERSION);
  assert.equal(recorded.length, 1);
  assert.match(recorded[0], /money and bills/);
  await act(async () => view.unmount());
});

test("the five profile questions and the first prompt are what the plan says", () => {
  assert.deepEqual(
    PLATE_QUESTIONS.map((q) => q.key),
    ["areas", "people", "timeWindow", "obstacles", "datedSoon"],
  );
  assert.match(firstPrompt({ areas: ["Health"], people: [], obstacles: [] }).prompt, /health/);
  assert.match(firstPrompt(undefined).prompt, /the thing on your mind/);
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
  assert.match(text, /Coordinator/);
  assert.match(text, /Work project/);
  assert.match(text, /Boss/);
  assert.match(text, /Sam/);
  assert.match(text, /Mornings/);
  await press(view, "Record feedback");
  assert.deepEqual(fb, ["voice"]);
  assert.ok(labels(view).includes("Redo the test and profile"));
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
