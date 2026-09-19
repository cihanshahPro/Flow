import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ThreadChat } = await import("../src/components/ThreadChat.tsx");
const { default: Home } = await import("../src/components/Home.tsx");
const { respondToRecording, answerChip, pendingMessage } = await import("../src/thread.ts");
const { suggestDraft } = await import("../src/drafts.ts");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date("2026-09-19T15:00:00.000Z");
const rich =
  "I need to finish the tax filing with my accountant before Friday because the deadline is strict, otherwise there is a penalty. First I have to collect the receipts, then tonight I'll email her.";
const vague = "Thinking about the garage situation and how messy it has gotten.";
const labels = (view) => view.root.findAllByType("Pressable").map((n) => n.props.accessibilityLabel).filter(Boolean);
const textOf = (view) => JSON.stringify(view.toJSON());

async function render(element) {
  let view;
  await act(async () => {
    view = renderer.create(element);
  });
  return view;
}

test("a dumped thread shows the transcript, Flow's reply, one question, and only Record as the primary action", async () => {
  const thread = respondToRecording(suggestDraft("t1", vague, now), "n1", vague, { now });
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "explorer", onRecord() {}, onWrite() {}, onChip() {}, onClose() {} }),
  );
  const text = textOf(view);
  const found = labels(view);
  assert.match(text, /garage situation/);
  assert.match(text, /What would you want to come out of this/);
  // Suggested answers ride along with the question; recording is still the other way.
  assert.ok(found.includes("Get it done and off my list"));
  assert.ok(found.includes("Record"));
  assert.ok(found.includes("Write instead"));
  assert.ok(!found.includes("Do this"), "no move offered before the thread is ready");
  assert.ok(!found.some((l) => /mark done|add task|classify/i.test(l)));
  assert.match(text, /Record the answer/);
  await act(async () => view.unmount());
});

test("a ready thread shows the hype bubble and a move with exactly two chips; tapping calls back with the chip", async () => {
  const thread = respondToRecording(suggestDraft("t2", rich, now), "n1", rich, { mode: "builder", now });
  const offer = pendingMessage(thread);
  assert.equal(offer.kind, "offer");
  const taps = [];
  const view = await render(
    React.createElement(ThreadChat, {
      thread, tasks: [], notes: [], mode: "builder", onRecord() {}, onWrite() {}, onClose() {},
      onChip: (id, chip) => taps.push([id, chip]),
    }),
  );
  const found = labels(view);
  assert.ok(found.includes("Do this"));
  assert.ok(found.includes("Not now"));
  assert.match(textOf(view), /Clear picture/);
  const doThis = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Do this");
  await act(async () => doThis.props.onPress());
  assert.deepEqual(taps, [[offer.id, "do"]]);
  await act(async () => view.unmount());
});

test("answered chips disappear and the reply shows as the user's bubble", async () => {
  const thread = respondToRecording(suggestDraft("t3", rich, now), "n1", rich, { now });
  const offer = pendingMessage(thread);
  const { thread: after } = answerChip(thread, offer.id, "skip", { now });
  const view = await render(
    React.createElement(ThreadChat, { thread: after, tasks: [], notes: [], mode: "analyst", onRecord() {}, onWrite() {}, onChip() {}, onClose() {} }),
  );
  const chips = view.root.findAllByType("Pressable").filter((n) => ["Do this", "Not now"].includes(n.props.accessibilityLabel));
  // Only the newest offer keeps live chips.
  assert.equal(chips.filter((c) => !c.props.disabled).length <= 2, true);
  assert.match(textOf(view), /Not now/);
  await act(async () => view.unmount());
});

test("the meter reflects the fingerprint and expands to the person's own evidence", async () => {
  const thread = respondToRecording(suggestDraft("t4", rich, now), "n1", rich, { now });
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "connector", onRecord() {}, onWrite() {}, onChip() {}, onClose() {} }),
  );
  const meter = view.root.findAllByType("Pressable").find((n) => /Flow has \d of 7 points/.test(n.props.accessibilityLabel));
  assert.ok(meter);
  await act(async () => meter.props.onPress());
  assert.match(textOf(view), /Outcome/);
  assert.match(textOf(view), /finish the tax filing/);
  await act(async () => view.unmount());
});

test("Home is one Record button plus thread cards that say what Flow needs; the Next card has Done and calendar only", async () => {
  const a = respondToRecording(suggestDraft("a", vague, now), "n1", vague, { now });
  const b = respondToRecording(suggestDraft("b", rich, now), "n2", rich, { now });
  const task = { id: "flow:b:auto", title: "Collect the receipts", done: false, createdAt: now.toISOString(), plannedDate: "" };
  const opened = [];
  const view = await render(
    React.createElement(Home, {
      threads: [a, b, { ...suggestDraft("ex", rich, now), example: true }],
      tasks: [task],
      nextTask: task,
      nextThread: b,
      levelLabel: "Starting point",
      suggestion: { title: "Health", prompt: "What's the one thing in health hanging over you?" },
      onRecord() {}, onWrite() {}, onRecordOther() {}, onDoneNext() {}, onCalendarNext() {}, onOpenMe() {}, onDismissNotice() {},
      onOpenThread: (id) => opened.push(id),
    }),
  );
  const found = labels(view);
  assert.equal(found.filter((l) => l === "Record").length, 1);
  assert.ok(found.includes("Done"));
  assert.ok(found.includes("Put it on my calendar"));
  assert.ok(found.includes("Me"));
  assert.ok(!found.some((l) => /Library|Feedback|Today|My mind|Settings/.test(l)), "no tabs to choose between");
  const cards = found.filter((l) => l.startsWith("Open thread "));
  assert.equal(cards.length, 2, "example drafts are never shown");
  const text = textOf(view);
  assert.match(text, /Flow has a question/);
  assert.match(text, /Flow has a move for you/);
  const card = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === `Open thread ${a.title}`);
  await act(async () => card.props.onPress());
  assert.deepEqual(opened, ["a"]);
  await act(async () => view.unmount());
});

test("an empty Home is Flow's suggested prompt with one Record button", async () => {
  const view = await render(
    React.createElement(Home, {
      threads: [], tasks: [], levelLabel: "Me",
      suggestion: { title: "Money & bills", prompt: "What's the one thing in money & bills hanging over you?" },
      onRecord() {}, onWrite() {}, onRecordOther() {}, onDoneNext() {}, onCalendarNext() {}, onOpenMe() {}, onDismissNotice() {}, onOpenThread() {},
    }),
  );
  const found = labels(view);
  assert.deepEqual(found.sort(), ["Me", "Record", "Something else", "Write instead"]);
  assert.match(textOf(view), /FLOW SUGGESTS/);
  assert.match(textOf(view), /Money & bills/);
  assert.doesNotMatch(textOf(view), /What's on your mind\?/);
  await act(async () => view.unmount());
});
