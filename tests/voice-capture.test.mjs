import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: VoiceCapture } = await import(
  "../src/components/VoiceCapture.tsx"
);
const { harness } = await import("./voice-mocks.mjs");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pause = () => new Promise((r) => setTimeout(r, 30));
const text = (node) =>
  Array.isArray(node)
    ? node.map(text).join(" ")
    : typeof node === "object" && node
      ? text(node.children)
      : String(node ?? "");
const button = (root, label) =>
  root.root
    .findAllByType("Pressable")
    .find(
      (x) =>
        text(x.toJSON?.() ?? x.props.children).includes(label) ||
        x
          .findAllByType("Text")
          .some((t) => text(t.props.children).includes(label)),
    );
test("permission-sheet inactivity does not cancel capture; stop persists audio and exposes playback", async () => {
  harness.reset();
  harness.permissionDialog = true;
  const saved = [];
  let root;
  await act(async () => {
    root = create(
      React.createElement(VoiceCapture, {
        autoStart: true,
        onSaved: async (n) => saved.push(n),
      }),
    );
  });
  await act(pause);
  assert.equal(harness.starts, 1);
  await act(async () => button(root, "Stop & save").props.onPress());
  assert.equal(saved.length, 1);
  assert.match(saved[0].audioUri, /file:\/\/documents\/anchor-voice-/);
  assert.equal(harness.savedFiles().length, 1);
  assert.ok(text(root.toJSON()).includes("Recording saved on this device."));
  assert.ok(text(root.toJSON()).includes("Play"));
  await act(async () => root.unmount());
});
test("permission denial remains recoverable with explicit manual retry", async () => {
  harness.reset();
  harness.permission = { granted: false, canAskAgain: true };
  let root;
  await act(async () => {
    root = create(
      React.createElement(VoiceCapture, {
        autoStart: true,
        onSaved: async () => {},
      }),
    );
  });
  assert.equal(harness.starts, 0);
  assert.ok(text(root.toJSON()).includes("Microphone access is needed"));
  harness.permission = { granted: true, canAskAgain: true };
  await act(async () => button(root, "Start recording").props.onPress());
  assert.equal(harness.starts, 1);
  await act(async () => button(root, "Stop & save").props.onPress());
  await act(async () => root.unmount());
});
test("failed metadata registration keeps audio and recovers using the same URI", async () => {
  harness.reset();
  let fail = true;
  const attempts = [];
  const recoveredKinds = [];
  let root;
  await act(async () => {
    root = create(
      React.createElement(VoiceCapture, {
        autoStart: true,
        onSaved: async (n) => {
          attempts.push(n.audioUri);
          recoveredKinds.push(n.captureKind);
          if (fail) throw Error("storage busy");
        },
      }),
    );
  });
  await act(async () => button(root, "Stop & save").props.onPress());
  assert.equal(harness.savedFiles().length, 1);
  assert.ok(text(root.toJSON()).includes("Recovery needs attention"));
  fail = false;
  await act(async () => button(root, "Retry recovery").props.onPress());
  assert.equal(new Set(attempts).size, 1);
  assert.equal(attempts.length, 2);
  assert.deepEqual(recoveredKinds, [undefined, "note"], "unknown recovered audio is kept in Library, never assigned to the current plan/feedback");
  assert.ok(text(root.toJSON()).includes("Ready when you are"));
  await act(async () => root.unmount());
});
test("capture waits for its sheet to be visible before auto-starting", async () => {
  harness.reset();
  let root;
  const props = { autoStart: false, onSaved: async () => {} };
  await act(async () => {
    root = create(React.createElement(VoiceCapture, props));
  });
  assert.equal(harness.starts, 0);
  await act(async () =>
    root.update(
      React.createElement(VoiceCapture, { ...props, autoStart: true }),
    ),
  );
  assert.equal(harness.starts, 1);
  await act(async () => button(root, "Stop & save").props.onPress());
  await act(async () => root.unmount());
});
test("leaving the app stops and saves once, instead of discarding recording", async () => {
  harness.reset();
  const saved = [];
  let root;
  await act(async () => {
    root = create(
      React.createElement(VoiceCapture, {
        autoStart: true,
        onSaved: async (n) => saved.push(n),
      }),
    );
  });
  await act(async () => harness.state("background"));
  assert.equal(saved.length, 1);
  assert.equal(harness.stops, 1);
  await act(async () => harness.state("active"));
  assert.equal(harness.starts, 1);
  await act(async () => root.unmount());
});
test("a completed durable save notifies processing once without writing a second journal", async () => {
  harness.reset();
  const completed = [];
  const saved = [];
  let root;
  await act(async () => {
    root = create(
      React.createElement(VoiceCapture, {
        autoStart: true,
        onSaved: async (n) => saved.push(n),
        onComplete: (n) => completed.push(n),
      }),
    );
  });
  const stop = button(root, "Stop & save").props.onPress;
  await act(async () => {
    stop();
    stop();
  });
  assert.equal(saved.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].audioUri, saved[0].audioUri);
  await act(async () => root.unmount());
});
