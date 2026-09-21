import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ThreadChat } = await import("../src/components/ThreadChat.tsx");
const { default: Today } = await import("../src/components/Today.tsx");
const { default: Threads } = await import("../src/components/Threads.tsx");
const { default: TabBar } = await import("../src/components/TabBar.tsx");
const { default: Intake } = await import("../src/components/Intake.tsx");
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

/** dump → "that's it" → challenge → want → help answered: a move on the table. */
let n = 50;
const answer = (t, text) => respondToRecording(t, `a${n++}`, text, { now });
const toMove = (t) => ["that's it", "the receipts are all over the place", "the filing done before Friday", "just tell me the first step"].reduce(answer, t);

test("a dumped thread shows the transcript, Flow's reply, the script's question with no buttons, and a message bar", async () => {
  const thread = respondToRecording(suggestDraft("t1", vague, now), "n1", vague, { now });
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "explorer", onRecord() {}, onSend() {}, onChip() {}, onClose() {} }),
  );
  const text = textOf(view);
  const found = labels(view);
  assert.match(text, /garage situation/);
  assert.match(text, /And what else\?/);
  assert.ok(!found.includes("Get it done and off my list"), "no suggestion chips: the person types or speaks");
  assert.ok(found.includes("Record"));
  assert.ok(found.includes("Send"));
  assert.ok(view.root.findAllByType("TextInput").some((n) => n.props.accessibilityLabel === "Message Flow"), "a real message bar");
  assert.ok(!found.includes("Do this"), "no move offered before the thread is understood");
  assert.ok(!found.some((l) => /mark done|add task|classify/i.test(l)));
  assert.match(text, /Getting to know this/);
  await act(async () => view.unmount());
});

test("an understood thread shows the hype bubble, Flow gets it, and a move with no buttons", async () => {
  const thread = toMove(respondToRecording(suggestDraft("t2", rich, now), "n1", rich, { mode: "builder", now }));
  const offer = pendingMessage(thread);
  assert.equal(offer.kind, "offer");
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "builder", onRecord() {}, onSend() {}, onClose() {}, onChip() {} }),
  );
  const found = labels(view);
  assert.ok(!found.includes("Do this"), "a move is accepted by replying, not by a button");
  assert.match(textOf(view), /full picture/);
  assert.match(textOf(view), /Flow gets it/);
  assert.match(textOf(view), /Say “do it”/);
  await act(async () => view.unmount());
});

test("the split question is the only place with buttons, and answered ones disappear", async () => {
  const multi = "Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday. Also my landlord is asking about the lease renewal by end of month.";
  const thread = respondToRecording(suggestDraft("t3", multi, now), "n1", multi, { now });
  const branch = pendingMessage(thread);
  assert.equal(branch.kind, "branch");
  const taps = [];
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "analyst", onRecord() {}, onSend() {}, onClose() {}, onChip: (id, chip) => taps.push([id, chip]) }),
  );
  const found = labels(view);
  assert.ok(found.includes("Yes") && found.includes("No"));
  const yes = view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Yes");
  await act(async () => yes.props.onPress());
  assert.deepEqual(taps, [[branch.id, "split"]]);
  await act(async () => view.unmount());
  const { thread: after } = answerChip(thread, branch.id, "keep", { now });
  const view2 = await render(
    React.createElement(ThreadChat, { thread: after, tasks: [], notes: [], mode: "analyst", onRecord() {}, onSend() {}, onChip() {}, onClose() {} }),
  );
  assert.ok(!labels(view2).includes("Yes"), "answered buttons are gone");
  assert.match(textOf(view2), /"No"/, "the reply shows as the person's bubble");
  await act(async () => view2.unmount());
});

test("the meter reflects the fingerprint and expands to the person's own evidence", async () => {
  const thread = respondToRecording(suggestDraft("t4", rich, now), "n1", rich, { now });
  const view = await render(
    React.createElement(ThreadChat, { thread, tasks: [], notes: [], mode: "connector", onRecord() {}, onSend() {}, onChip() {}, onClose() {} }),
  );
  const meter = view.root.findAllByType("Pressable").find((n) => /Flow is \d+% of the way/.test(n.props.accessibilityLabel));
  assert.ok(meter);
  await act(async () => meter.props.onPress());
  assert.match(textOf(view), /Outcome/);
  assert.match(textOf(view), /finish the tax filing/);
  await act(async () => view.unmount());
});

test("Today is the day's plan: what's on the calendar, the one move, chases, tomorrow's watch-out, one Record button", async () => {
  const b = toMove(respondToRecording(suggestDraft("b", rich, now), "n2", rich, { now }));
  const task = { id: "flow:b:auto", title: "Collect the receipts", done: false, createdAt: now.toISOString(), plannedDate: "" };
  const events = [
    { id: "sync", calendarId: "c", title: "Team sync", start: "2026-09-19T15:00:00.000Z", end: "2026-09-19T15:45:00.000Z", allDay: false },
    { id: "mine", calendarId: "c", title: "Call the DUI lawyer", start: "2026-09-19T16:00:00.000Z", end: "2026-09-19T16:20:00.000Z", allDay: false, mine: true, ref: "flow:x" },
  ];
  const chase = { id: "flow:dui:chase", title: "Lawyer's follow-up", kind: "waiting", waitingOn: "the lawyer", chaseDate: "2026-09-19", done: false, createdAt: now.toISOString(), plannedDate: "" };
  const view = await render(
    React.createElement(Today, {
      threads: [b], tasks: [task, chase], nextTask: task, nextThread: b, levelLabel: "Starting point",
      suggestion: { title: "Health", prompt: "What's the one thing in health hanging over you?" },
      day: { events, moves: [], chases: [chase], tomorrow: [{ kind: "important", date: "2026-09-20", title: "Court hearing", note: "tomorrow · 10am" }] },
      calendar: { connected: true, onConnect() {} },
      onRecord() {}, onWrite() {}, onRecordOther() {}, onDoneNext() {}, onCalendarNext() {}, onOpenMe() {}, onDismissNotice() {}, onOpenThread() {},
    }),
  );
  const found = labels(view);
  assert.equal(found.filter((l) => l === "Record").length, 1);
  assert.ok(found.includes("Done"));
  assert.ok(!found.some((l) => /Library|My mind|Settings|Get to know me|Connect calendar/.test(l)));
  const text = textOf(view);
  assert.match(text, /TODAY'S PLAN/);
  assert.match(text, /Team sync/);
  assert.match(text, /Call the DUI lawyer/);
  assert.match(text, /"the lawyer",": ","Lawyer's follow-up"/);
  assert.match(text, /TOMORROW · WATCH OUT/);
  assert.match(text, /Court hearing/);
  assert.doesNotMatch(text, /YOUR THREADS|MAKE FLOW FIT YOU/);
  await act(async () => view.unmount());
  const off = await render(
    React.createElement(Today, {
      threads: [], tasks: [], levelLabel: "Me", suggestion: { title: "x", prompt: "y" }, calendar: { connected: false, onConnect() {} },
      onRecord() {}, onWrite() {}, onRecordOther() {}, onDoneNext() {}, onCalendarNext() {}, onOpenMe() {}, onDismissNotice() {}, onOpenThread() {},
    }),
  );
  assert.ok(labels(off).includes("Connect calendar"), "one card until the calendar is connected");
  await act(async () => off.unmount());
});

test("an empty Today is Flow's suggested prompt with one Record button", async () => {
  const view = await render(
    React.createElement(Today, {
      threads: [], tasks: [], levelLabel: "Me",
      suggestion: { title: "Money & bills", prompt: "What's the one thing in money & bills hanging over you?" },
      onRecord() {}, onWrite() {}, onRecordOther() {}, onDoneNext() {}, onCalendarNext() {}, onOpenMe() {}, onDismissNotice() {}, onOpenThread() {},
    }),
  );
  const found = labels(view);
  assert.deepEqual(found.sort(), ["Record", "Something else", "Write instead", "Your level"]);
  assert.match(textOf(view), /FLOW SUGGESTS/);
  assert.match(textOf(view), /Money & bills/);
  assert.doesNotMatch(textOf(view), /What's on your mind\?/);
  await act(async () => view.unmount());
});

test("Threads is a Messages-style list: newest first, quiet ones last, a dot when Flow is waiting, one New thread button; the tab bar has four tabs and a badge", async () => {
  const a = respondToRecording(suggestDraft("a", vague, now), "n1", vague, { now });
  const b = { ...respondToRecording(suggestDraft("b", rich, now), "n2", rich, { now: new Date(now.getTime() + 60_000) }), state: "parked" };
  const c = { ...suggestDraft("c", "Clean the garage this weekend.", now), messages: [], resolvedAt: now.toISOString() };
  const view = await render(React.createElement(Threads, { threads: [a, b, c], tasks: [], now: new Date(now.getTime() + 3_600_000), onOpenThread() {}, onNew() {} }));
  const cards = labels(view).filter((l) => l.startsWith("Open thread "));
  assert.equal(cards.length, 3);
  assert.equal(cards[0], `Open thread ${a.title}`, "the live thread comes first even though the parked one is newer");
  assert.ok(labels(view).includes("New thread"));
  assert.equal(textOf(view).split('"Needs you"').length - 1, 1, "one unread dot: the thread with an open question");
  assert.match(textOf(view), /"1"," open"/);
  assert.match(textOf(view), /Parked/);
  assert.match(textOf(view), /"Done"/);
  assert.match(textOf(view), /And what else\?/, "the last message is the preview, like Messages");
  assert.doesNotMatch(textOf(view), /ACTIVE|WAITING/, "no groups, no labels to learn");
  await act(async () => view.unmount());
  const picked = [];
  const bar = await render(React.createElement(TabBar, { active: "today", badge: 2, onSelect: (t) => picked.push(t) }));
  const tabs = bar.root.findAllByType("Pressable").map((n) => n.props.accessibilityLabel);
  assert.deepEqual(tabs, ["Today", "Threads", "Calendar", "Profile"]);
  assert.match(textOf(bar), /"2"/);
  await act(async () => bar.root.findAllByType("Pressable")[3].props.onPress());
  assert.deepEqual(picked, ["profile"]);
  await act(async () => bar.unmount());
});

test("the intake screen shows every starter with its date, one Record button and a quiet way out", async () => {
  const mk = (id, title, evidence, hints = []) => respondToRecording({ ...suggestDraft(id, evidence, now), title, dueHints: hints }, "dump", evidence, { now, quiet: true });
  const drafts = [
    mk("d0", "Demo for Friday", "My manager wants a demo Friday.", [{ date: "2026-09-25", phrase: "friday" }]),
    mk("d1", "An answer on the lease", "The landlord wants an answer on the lease by the end of the month.", [{ date: "2026-09-30", phrase: "end of the month" }]),
    mk("d2", "Renew my passport", "I need to renew my passport before Lisbon in November."),
  ];
  const opened = [], acts = [];
  const view = await render(React.createElement(Intake, { drafts, now, onOpen: (id) => opened.push(id), onMore: () => acts.push("more"), onDone: () => acts.push("done") }));
  const text = textOf(view);
  assert.match(text, /I heard ","3"," things"," and started a thread for each"/);
  assert.match(text, /And what else\?/);
  assert.match(text, /"Friday"/);
  assert.match(text, /End of the month/);
  assert.match(text, /2 have a date/);
  const found = labels(view);
  assert.deepEqual(found.filter((l) => !l.startsWith("Open thread")), ["Record more", "That's all for now"]);
  await act(async () => view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Open thread Renew my passport").props.onPress());
  assert.deepEqual(opened, ["d2"]);
  assert.equal(drafts[2].messages.some((m) => m.kind === "question"), false, "starters are quiet until opened");
  await act(async () => view.unmount());
});
