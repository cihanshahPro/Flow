import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Onboarding } =
  await import("../src/components/Onboarding.tsx");
const { newProfile } = await import("../src/personality.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("assessment advances through exact 20 answers, then choices build a map and hand off to voice", async () => {
  let profile = newProfile(),
    view,
    captured;
  const props = () => ({
    profile,
    onSave: async (p) => {
      profile = p;
      view.update(React.createElement(Onboarding, props()));
    },
    onClose() {},
    onCapture: (t) => (captured = t),
  });
  await act(async () => {
    view = renderer.create(React.createElement(Onboarding, props()));
  });
  const tap = async (label) =>
    act(async () => {
      const b = view.root
        .findAllByType("Pressable")
        .find((x) => x.props.accessibilityLabel === label);
      assert.ok(b, label);
      await b.props.onPress();
    });
  await tap("Get to know me");
  for (let i = 0; i < 20; i++) await tap("Moderately accurate");
  assert.equal(profile.stage, "results");
  assert.equal(profile.answers.length, 20);
  await tap("Use my recommended path");
  await tap("Build something");
  await tap("Find work or clients");
  assert.equal(profile.areaIndex, 0);
  assert.deepEqual(profile.areas.work, [
    "Build something",
    "Find work or clients",
  ]);
  await tap("Continue with 2 selected");
  for (let i = 0; i < 5; i++) await tap("Nothing current");
  assert.equal(profile.stage, "map");
  assert.equal(view.root.findAllByType("TextInput").length, 0);
  await tap("Walk me through this");
  await tap("The task feels too big");
  await tap("Record my first step");
  assert.ok(captured.startsWith("Work & making: Build something"));
  await tap("Back to my starting point");
  assert.equal(profile.completed, true);
  await tap("Remove personality answers");
  assert.deepEqual(profile.answers, []);
  assert.equal(profile.presentation, undefined);
  await act(async () => view.unmount());
});
test("saving failure stays on current question and offers retry", async () => {
  let view;
  await act(async () => {
    view = renderer.create(
      React.createElement(Onboarding, {
        profile: { ...newProfile(), stage: "assessment" },
        onSave: async () => {
          throw Error("disk");
        },
        onClose() {},
        onCapture() {},
      }),
    );
  });
  await act(async () =>
    view.root
      .findAllByType("Pressable")
      .find((x) => x.props.accessibilityLabel === "Very accurate")
      .props.onPress(),
  );
  assert.ok(JSON.stringify(view.toJSON()).includes("Could not save"));
  assert.ok(
    JSON.stringify(view.toJSON()).includes("Am the life of the party."),
  );
  await act(async () => view.unmount());
});
