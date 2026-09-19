import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Onboarding } =
  await import("../src/components/Onboarding.tsx");
const { newProfile, AREAS } = await import("../src/personality.ts");
const { profileCompletion } = await import("../src/profile-completion.ts");
const { newProgress, reconcileProgress, levelForProgress } =
  await import("../src/progress.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reviewedAreas = () =>
  Object.fromEntries(AREAS.map((area) => [area.id, "Nothing current"]));

async function funnel(initial, existingWork = false) {
  let profile = initial;
  let view;
  const calls = { continued: 0, captured: 0, started: 0, closed: 0 };
  const props = () => ({
    profile,
    existingWork,
    onSave: async (saved) => {
      profile = JSON.parse(JSON.stringify(saved));
      view.update(React.createElement(Onboarding, props()));
    },
    onContinue: () => calls.continued++,
    onCapture: () => calls.captured++,
    onStart: () => calls.started++,
    onClose: () => calls.closed++,
  });
  await act(async () => {
    view = renderer.create(React.createElement(Onboarding, props()));
  });
  return {
    get profile() { return profile; },
    get view() { return view; },
    calls,
    async tap(label) {
      await act(async () => {
        const button = view.root.findAllByType("Pressable").find((node) =>
          node.props.accessibilityLabel === label);
        assert.ok(button, `Expected funnel choice: ${label}`);
        assert.notEqual(button.props.disabled, true);
        await button.props.onPress();
      });
      assert.equal(view.root.findAllByType("TextInput").length, 0);
    },
    close: () => act(async () => view.unmount()),
  };
}

test("reviewed profile with no interests reaches 100% and Today without inventing a goal", async () => {
  const f = await funnel({
    ...newProfile(),
    stage: "map",
    answers: Array(20).fill(3),
    areas: reviewedAreas(),
    presentation: "small",
  });
  await f.tap("Confirm no current focus");
  assert.equal(f.profile.stage, "capacity");
  assert.equal(f.profile.focusNone, true);
  assert.equal(f.profile.focusExplicit, false);
  assert.equal(f.profile.focus, undefined);
  await f.tap("10 minutes");
  assert.equal(f.profile.stage, "guide");
  assert.equal(profileCompletion(f.profile).percent, 100);
  assert.equal(
    levelForProgress(reconcileProgress(newProgress(), f.profile, [], [])).unlocked,
    true,
  );
  await f.tap("Go to Today");
  assert.equal(f.profile.completed, true);
  assert.deepEqual(f.profile.areas, reviewedAreas());
  assert.deepEqual(f.calls, { continued: 1, captured: 0, started: 0, closed: 0 });
  await f.close();
});

test("skipping personality still guides preferences and allows Today while levels remain locked", async () => {
  const f = await funnel(newProfile());
  await f.tap("Skip assessment");
  for (let index = 0; index < AREAS.length; index++) {
    assert.equal(f.profile.areaIndex, index);
    await f.tap("Nothing current");
  }
  assert.equal(f.profile.stage, "map");
  await f.tap("Confirm no current focus");
  assert.equal(f.profile.stage, "preferences");
  await f.tap("One small action at a time");
  assert.equal(f.profile.stage, "capacity");
  await f.tap("It varies — I’ll choose each day");
  assert.equal(f.profile.stage, "guide");
  assert.deepEqual(f.profile.answers, []);
  assert.equal(f.profile.presentation, "small");
  assert.equal(f.profile.preferredMinutes, "varies");
  assert.equal(profileCompletion(f.profile).percent, 80);
  assert.equal(profileCompletion(f.profile).next.id, "assessment");
  const progress = levelForProgress(
    reconcileProgress(newProgress(), f.profile, [], []),
  );
  assert.equal(progress.unlocked, false);
  assert.equal(progress.level, null);
  await f.tap("Go to Today");
  assert.equal(f.profile.completed, true);
  assert.deepEqual(f.calls, { continued: 1, captured: 0, started: 0, closed: 0 });
  await f.close();
});

test("existing work resumes after focus and capacity confirmation without duplicate intake or starter", async () => {
  const f = await funnel({
    ...newProfile(),
    stage: "map",
    answers: Array(20).fill(3),
    areas: { ...reviewedAreas(), work: ["Build something"] },
    presentation: "sequence",
  }, true);
  await f.tap("Walk me through this");
  assert.equal(f.profile.focus, "Work & making: Build something");
  assert.equal(f.profile.focusExplicit, true);
  assert.equal(f.profile.focusNone, false);
  assert.equal(f.profile.stage, "capacity");
  await f.tap("30 minutes");
  assert.equal(f.profile.stage, "guide");
  assert.equal(profileCompletion(f.profile).percent, 100);
  const labels = f.view.root.findAllByType("Pressable").map((node) =>
    node.props.accessibilityLabel);
  assert.ok(labels.includes("Continue my saved work"));
  assert.ok(!labels.includes("Use this first step"));
  assert.ok(!labels.includes("Use my own details instead"));
  await f.tap("Continue my saved work");
  assert.deepEqual(f.calls, { continued: 1, captured: 0, started: 0, closed: 0 });
  await f.close();
});
