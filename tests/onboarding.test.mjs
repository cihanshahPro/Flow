import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Onboarding } =
  await import("../src/components/Onboarding.tsx");
const { newProfile } = await import("../src/personality.ts");
const { profileCompletion } = await import("../src/profile-completion.ts");
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
    onStart() {},
    onContinue() {},
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
  assert.equal(profile.stage, "capacity");
  assert.equal(profile.focusExplicit, true);
  await tap("10 minutes");
  assert.equal(profileCompletion(profile).percent, 100);
  await tap("Shape my first plan");
  assert.ok(captured.startsWith("Work & making: Build something"));
  await tap("Back to my starting point");
  assert.notEqual(profile.completed, true);
  const savedPresentation = profile.presentation;
  await tap("Edit saved setup");
  await tap("Remove personality answers");
  assert.deepEqual(profile.answers, []);
  assert.equal(profile.presentation, savedPresentation);
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
        onStart() {},
        onContinue() {},
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

test("targeted assessment completion returns to Profile and leaves life areas untouched", async () => {
  let profile = {
    ...newProfile(),
    answers: Array(19).fill(3),
    stage: "assessment",
    areas: { work: ["Build something"] },
  };
  let view,
    closed = 0;
  const props = () => ({
    profile,
    sectionMode: "assessment",
    onSave: async (p) => {
      profile = p;
      view.update(React.createElement(Onboarding, props()));
    },
    onClose() {
      closed++;
    },
    onCapture() {
      throw Error("unexpected capture");
    },
    onStart() {
      throw Error("unexpected start");
    },
    onContinue() {
      throw Error("unexpected funnel");
    },
  });
  await act(async () => {
    view = renderer.create(React.createElement(Onboarding, props()));
  });
  await act(async () => {
    await view.root
      .findAllByType("Pressable")
      .find((b) => b.props.accessibilityLabel === "Very accurate")
      .props.onPress();
  });
  assert.equal(closed, 1);
  assert.equal(profile.answers.length, 20);
  assert.deepEqual(profile.areas, { work: ["Build something"] });
  await act(async () => view.unmount());
});
test("targeted last missing area returns directly to Profile without the map or recorder", async () => {
  let profile = {
    ...newProfile(),
    stage: "areas",
    areaIndex: 5,
    areas: {
      work: "Nothing current",
      people: "Nothing current",
      admin: "Nothing current",
      home: "Nothing current",
      health: "Nothing current",
      dates: "Later",
    },
  };
  let view,
    closed = 0;
  const props = () => ({
    profile,
    sectionMode: "areas",
    onSave: async (p) => {
      profile = p;
      view.update(React.createElement(Onboarding, props()));
    },
    onClose() {
      closed++;
    },
    onCapture() {
      throw Error("unexpected capture");
    },
    onStart() {},
    onContinue() {},
  });
  await act(async () => {
    view = renderer.create(React.createElement(Onboarding, props()));
  });
  await act(async () => {
    await view.root
      .findAllByType("Pressable")
      .find((b) => b.props.accessibilityLabel === "Nothing current")
      .props.onPress();
  });
  assert.equal(closed, 1);
  assert.equal(profile.areas.dates, "Nothing current");
  await act(async () => view.unmount());
});

test("retaking assessment preserves confirmed focus, guidance and available time", async () => {
  let profile = {
    ...newProfile(),
    answers: Array(20).fill(3),
    stage: "map",
    areas: { work: ["Build something"] },
    focus: "Work & making: Build something",
    focusExplicit: true,
    presentation: "sequence",
    preferredMinutes: 10,
  };
  let view;
  const props = () => ({
    profile,
    onSave: async (p) => {
      profile = p;
      view.update(React.createElement(Onboarding, props()));
    },
    onClose() {},
    onCapture() {},
    onStart() {},
    onContinue() {},
  });
  await act(async () => {
    view = renderer.create(React.createElement(Onboarding, props()));
  });
  await act(async () => {
    await view.root.findAllByType("Pressable").find(b => b.props.accessibilityLabel === "Edit saved setup").props.onPress();
  });
  await act(async () => {
    await view.root
      .findAllByType("Pressable")
      .find((b) => b.props.accessibilityLabel === "Retake assessment")
      .props.onPress();
  });
  assert.deepEqual(profile.answers, []);
  assert.equal(profile.preferredMinutes, 10);
  assert.equal(profile.presentation, "sequence");
  assert.equal(profile.focusExplicit, true);
  await act(async () => view.unmount());
});
