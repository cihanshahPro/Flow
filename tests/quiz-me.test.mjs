import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Quiz } = await import("../src/components/Quiz.tsx");
const { default: Me } = await import("../src/components/Me.tsx");
const { newProfile, ITEMS } = await import("../src/personality.ts");
const { newProgress } = await import("../src/progress.ts");
const { suggestDraft } = await import("../src/drafts.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const labels = (view) => view.root.findAllByType("Pressable").map((n) => n.props.accessibilityLabel).filter(Boolean);
const textOf = (view) => JSON.stringify(view.toJSON());
const press = (view, label) => {
  const node = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === label);
  assert.ok(node, `missing ${label}`);
  return act(async () => node.props.onPress());
};
async function render(element) {
  let view;
  await act(async () => {
    view = renderer.create(element);
  });
  return view;
}

test("the quiz walks intro → twenty taps → reveal → plate, one primary action per screen, skippable", async () => {
  let profile = newProfile();
  const saves = [];
  const finished = [];
  const props = () => ({
    profile,
    onSave: async (p) => {
      saves.push(p.stage);
      profile = p;
    },
    onFinish: async (p) => finished.push(p),
  });
  let view = await render(React.createElement(Quiz, props()));
  assert.deepEqual(labels(view), ["Get to know me · 2 min", "Skip for now"]);
  await press(view, "Get to know me · 2 min");
  assert.equal(profile.stage, "assessment");
  await act(async () => view.update(React.createElement(Quiz, props())));
  assert.match(textOf(view), new RegExp(ITEMS[0].text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (let i = 0; i < ITEMS.length; i++) {
    await press(view, i % 2 ? "Very me" : "Not me");
    await act(async () => view.update(React.createElement(Quiz, props())));
  }
  assert.equal(profile.answers.length, 20);
  assert.equal(profile.stage, "results");
  assert.match(textOf(view), /You're a \w+\./);
  assert.doesNotMatch(textOf(view), /[EI][NS][FT][JP]/, "no MBTI code");
  await press(view, "Next");
  await act(async () => view.update(React.createElement(Quiz, props())));
  assert.equal(profile.stage, "areas");
  await press(view, "Work & making");
  await act(async () => view.update(React.createElement(Quiz, props())));
  await press(view, "Start recording");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].completed, true);
  assert.deepEqual(finished[0].areas.work, ["Active"]);
  assert.deepEqual(finished[0].areas.people, ["Nothing current"]);
  await act(async () => view.unmount());

  // Skipping is a single tap and still completes the profile.
  profile = newProfile();
  view = await render(React.createElement(Quiz, props()));
  await press(view, "Skip for now");
  assert.equal(finished.length, 2);
  assert.equal(finished[1].completed, true);
  await act(async () => view.unmount());
});

test("Me shows the Flow type, the level with honest counters, what Flow knows, and the feedback route", async () => {
  const profile = { ...newProfile(), answers: ITEMS.map((i) => (i.reverse ? 1 : 5)), completed: true, areas: { work: ["Active"] } };
  const progress = { ...newProgress(), unlockedAt: "2026-09-19T00:00:00Z", completedTaskIds: ["a", "b"], understoodThreadIds: ["t"] };
  const threads = [
    suggestDraft("t", "Call Sam about the invoice. Then email the designer.", new Date()),
    suggestDraft("u", "Call Sam about the invoice.", new Date()),
  ];
  const fb = [];
  const view = await render(
    React.createElement(Me, { profile, progress, threads, notes: [{ id: "f", captureKind: "feedback", title: "x", text: "x", createdAt: "" }], onBack() {}, onRetake() {}, onFeedback: (m) => fb.push(m) }),
  );
  const text = textOf(view);
  assert.match(text, /Coordinator/);
  assert.match(text, /Momentum/);
  assert.match(text, /\["2"\][^]*moves done/);
  assert.match(text, /Work & making/);
  assert.match(text, /People you've mentioned/);
  assert.match(text, /Sam/);
  assert.match(text, /came up in ","2"," threads/);
  assert.match(text, /"1"," saved so far/);
  await press(view, "Record feedback");
  assert.deepEqual(fb, ["voice"]);
  assert.ok(labels(view).includes("Retake the quiz"));
  await act(async () => view.unmount());
});

test("Me before the quiz is honest about what is not set", async () => {
  const view = await render(
    React.createElement(Me, { profile: newProfile(), progress: newProgress(), threads: [], notes: [], onBack() {}, onRetake() {}, onFeedback() {} }),
  );
  const text = textOf(view);
  assert.match(text, /Not set yet/);
  assert.match(text, /Levels start once you've done the quiz/);
  assert.match(text, /Pattern notices unlock at Momentum/);
  await act(async () => view.unmount());
});
