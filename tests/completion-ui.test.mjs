import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Completion } =
  await import("../src/components/ProfileCompletion.tsx");
const { newProfile, AREAS } = await import("../src/personality.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const almost = () => ({
  ...newProfile(),
  answers: Array(20).fill(3),
  areas: Object.fromEntries(
    AREAS.map((a, i) => [
      a.id,
      i === 0 ? ["Build something"] : "Nothing current",
    ]),
  ),
  focus: "Work & making: Build something",
  focusExplicit: true,
  presentation: "small",
});
test("one missing field has a direct editor, saves and returns to 100% without rerunning setup", async () => {
  let p = almost(),
    view,
    assessment = 0;
  const props = () => ({
    profile: p,
    busy: false,
    onConfigure: async (patch) => {
      p = { ...p, ...patch };
      view.update(React.createElement(Completion, props()));
    },
    onAssessment() {
      assessment++;
    },
    onAreas() {},
  });
  await act(async () => {
    view = renderer.create(React.createElement(Completion, props()));
  });
  const tap = (label) =>
    act(async () => {
      await view.root
        .findAllByType("Pressable")
        .find((b) => b.props.accessibilityLabel === label)
        .props.onPress();
    });
  const progress = () =>
    view.root
      .findAllByType("View")
      .find((v) => v.props.accessibilityRole === "progressbar").props
      .accessibilityValue.now;
  assert.equal(progress(), 80);
  await tap("Set my available time");
  assert.equal(view.root.findAllByType("TextInput").length, 0);
  await tap("10 minutes");
  assert.equal(p.preferredMinutes, 10);
  assert.equal(progress(), 100);
  assert.equal(assessment, 0);
  assert.ok(
    JSON.stringify(view.toJSON()).includes("Your starting profile is ready."),
  );
  await act(async () => view.unmount());
  // Reconstruct from stored JSON, as happens after restart.
  p = JSON.parse(JSON.stringify(p));
  await act(async () => {
    view = renderer.create(React.createElement(Completion, props()));
  });
  assert.equal(progress(), 100);
  await act(async () => view.unmount());
});
test("failed save does not advance completion or close the missing-field editor", async () => {
  let view;
  await act(async () => {
    view = renderer.create(
      React.createElement(Completion, {
        profile: almost(),
        busy: false,
        onConfigure: async () => {
          throw Error("disk");
        },
        onAssessment() {},
        onAreas() {},
      }),
    );
  });
  const tap = (label) =>
    act(async () => {
      await view.root
        .findAllByType("Pressable")
        .find((b) => b.props.accessibilityLabel === label)
        .props.onPress();
    });
  await tap("Set my available time");
  await tap("30 minutes");
  assert.ok(JSON.stringify(view.toJSON()).includes("Could not save"));
  assert.ok(
    view.root
      .findAllByType("Pressable")
      .some((b) => b.props.accessibilityLabel === "30 minutes"),
  );
  assert.equal(
    view.root
      .findAllByType("View")
      .find((v) => v.props.accessibilityRole === "progressbar").props
      .accessibilityValue.now,
    80,
  );
  await act(async () => view.unmount());
});

test("completed preferences stay editable and opening an editor does not change percentage", async () => {
  let p = { ...almost(), preferredMinutes: 30 },
    view;
  const props = () => ({
    profile: p,
    busy: false,
    onConfigure: async (patch) => {
      p = { ...p, ...patch };
      view.update(React.createElement(Completion, props()));
    },
    onAssessment() {},
    onAreas() {},
  });
  await act(async () => {
    view = renderer.create(React.createElement(Completion, props()));
  });
  const tap = (label) =>
    act(async () => {
      await view.root
        .findAllByType("Pressable")
        .find((b) => b.props.accessibilityLabel === label)
        .props.onPress();
    });
  await tap("Review my profile");
  await tap("Edit your usual time");
  assert.equal(
    view.root
      .findAllByType("View")
      .find((v) => v.props.accessibilityRole === "progressbar").props
      .accessibilityValue.now,
    100,
  );
  await tap("60 minutes");
  assert.equal(p.preferredMinutes, 60);
  await act(async () => view.unmount());
});
