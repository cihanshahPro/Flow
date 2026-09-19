import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ProfileView } =
  await import("../src/components/ProfileView.tsx");
const { newProfile } = await import("../src/personality.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("profile exposes supplied coverage, saved interests and a real continuation without rerunning onboarding", async () => {
  let view,
    continued = 0,
    focus = "";
  const p = {
    ...newProfile(),
    answers: Array(20).fill(3),
    areas: {
      work: ["Build something", "Find work or clients"],
      home: "Later",
      people: "Nothing current",
    },
  };
  await act(async () => {
    view = renderer.create(
      React.createElement(ProfileView, {
        profile: p,
        notes: [],
        drafts: [],
        tasks: [],
        busy: false,
        onContinue() {
          continued++;
        },
        onEditAreas() {},
        onAssessment() {},
        onPreference() {},
        onFocus: (t) => (focus = t),
      }),
    );
  });
  const tap = (label) =>
    act(async () =>
      view.root
        .findAllByType("Pressable")
        .find((b) => b.props.accessibilityLabel === label)
        .props.onPress(),
    );
  assert.equal(view.root.findAllByType("TextInput").length, 0);
  const text = JSON.stringify(view.toJSON());
  assert.ok(text.includes("assessment answers"));
  assert.ok(text.includes("Getting acquainted".toUpperCase()));
  assert.ok(!text.includes("%"));
  await tap("Go to my next step");
  assert.equal(continued, 1);
  await tap("See my saved interests");
  await tap("Focus on build something");
  assert.equal(focus, "Work & making: Build something");
  await tap("See my personality");
  assert.ok(JSON.stringify(view.toJSON()).includes("Emotional stability"));
  await act(async () => view.unmount());
});
