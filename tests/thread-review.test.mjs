import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ThreadReview } = await import("../src/components/ThreadReview.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const draft = {
  id: "thread-1", title: "Build a portfolio", topic: "Work", source: "I want to build a portfolio.",
  updates: [], steps: [], state: "draft", createdAt: "2026-09-18T00:00:00.000Z", threadStatus: "dumped", goalsReady: false,
};

test("a dumped thread asks for one missing answer and does not expose goals", async () => {
  let view;
  await act(async () => { view = renderer.create(React.createElement(ThreadReview, { draft, prompt: "What outcome matters most?", onCapture() {}, onDevelop() {}, onClose() {} })); });
  const labels = view.root.findAllByType("Pressable").map(node => node.props.accessibilityLabel);
  assert.ok(labels.includes("Record the answer"));
  assert.ok(!labels.includes("Add another recording"));
  assert.ok(!labels.includes("Add to this thread"));
  assert.ok(!labels.includes("Develop this thread into goals"));
  await act(async () => view.unmount());
});

test("only a ready thread exposes goal development", async () => {
  let view;
  await act(async () => { view = renderer.create(React.createElement(ThreadReview, { draft: { ...draft, threadStatus: "ready", goalsReady: true }, prompt: "What outcome matters most?", onCapture() {}, onDevelop() {}, onClose() {} })); });
  assert.ok(view.root.findAllByType("Pressable").some(node => node.props.accessibilityLabel === "Develop this thread into goals"));
  await act(async () => view.unmount());
});
