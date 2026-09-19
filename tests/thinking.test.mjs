import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: Thinking, thinkingLine, THINKING_LINES } = await import("../src/components/Thinking.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("the thinking state rotates calm lines and offers leaving or a basic draft", async () => {
  assert.deepEqual([...THINKING_LINES], ["Listening back…", "Finding the thread…", "Picking one next step…"]);
  assert.equal(thinkingLine(3), THINKING_LINES[0]);
  let left = 0, cancelled = 0, view;
  await act(async () => {
    view = renderer.create(React.createElement(Thinking, { onBackground: () => left++, onCancel: () => cancelled++ }));
  });
  assert.match(JSON.stringify(view.toJSON()), /Listening back/);
  const press = (label) => act(async () => view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === label).props.onPress());
  await press("Keep going, I'll come back");
  await press("Use a basic draft instead");
  assert.deepEqual([left, cancelled], [1, 1]);
  await act(async () => view.unmount());
});
