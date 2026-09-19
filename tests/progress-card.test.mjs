import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ProgressCard } =
  await import("../src/components/ProgressCard.tsx");
const { newProgress } = await import("../src/progress.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textOf(view) {
  return view.root
    .findAllByType("Text")
    .map((text) => text.children.join(""))
    .join("\n");
}

test("locked progress explains 100% unlock without exposing a level or another setup button", async () => {
  let view;
  await act(async () => {
    view = renderer.create(
      React.createElement(ProgressCard, {
        progress: { ...newProgress(), completedTaskIds: ["saved-action"] },
      }),
    );
  });
  const text = textOf(view);
  assert.match(text, /Levels unlock at 100% profile completion/);
  assert.match(text, /existing completed actions will count too/);
  assert.doesNotMatch(text, /LEVEL \d|\d actions? completed/);
  assert.equal(view.root.findAllByType("Pressable").length, 0);
  assert.equal(
    view.root.findAllByType("View").filter((v) =>
      v.props.accessibilityRole === "progressbar").length,
    0,
  );
  await act(async () => view.unmount());
});

test("unlocked progress shows actual accomplishments and the next milestone with an accessible bar", async () => {
  let view;
  await act(async () => {
    view = renderer.create(
      React.createElement(ProgressCard, {
        progress: {
          version: 1,
          unlockedAt: "2026-09-18T12:00:00Z",
          completedTaskIds: ["action-1", "action-2", "action-2"],
        },
      }),
    );
  });
  const text = textOf(view);
  assert.match(text, /LEVEL 2 · FIRST WIN/);
  assert.match(text, /2 actions completed/);
  assert.match(text, /1 more action to Level 3 — Building momentum/);
  const bar = view.root.findAllByType("View").find((v) =>
    v.props.accessibilityRole === "progressbar");
  assert.deepEqual(bar.props.accessibilityValue, {
    min: 0,
    max: 3,
    now: 2,
    text: "1 more action to Level 3 — Building momentum.",
  });
  assert.equal(view.root.findAllByType("Pressable").length, 0);
  await act(async () => view.unmount());
});

test("newly unlocked profile starts at Ready without inventing an accomplishment", async () => {
  let view;
  await act(async () => {
    view = renderer.create(
      React.createElement(ProgressCard, {
        progress: {
          ...newProgress(),
          unlockedAt: "2026-09-18T12:00:00Z",
        },
      }),
    );
  });
  const text = textOf(view);
  assert.match(text, /LEVEL 1 · READY/);
  assert.match(text, /0 actions completed/);
  assert.match(text, /1 more action to Level 2 — First win/);
  await act(async () => view.unmount());
});
