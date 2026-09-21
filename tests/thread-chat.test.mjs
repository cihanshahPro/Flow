import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer, { act } from "react-test-renderer";
register("./voice-loader.mjs", import.meta.url);
const { default: ThreadChat } = await import("../src/components/ThreadChat.tsx");
const { default: Today } = await import("../src/components/Today.tsx");
const { default: Recordings } = await import("../src/components/Recordings.tsx");
const { default: RecordingPage } = await import("../src/components/RecordingPage.tsx");
const { default: Upcoming } = await import("../src/components/Upcoming.tsx");
const { default: WeekPlan } = await import("../src/components/WeekPlan.tsx");
const { default: TabBar } = await import("../src/components/TabBar.tsx");
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
  const words = view.root.findAllByType("Text").flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children])).filter((c) => typeof c === "string").join(" ");
  assert.doesNotMatch(words, /Getting to know this|\d+%/, "no meter, no percent: the thread is a conversation, not a score");
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

test("Today is Things' shape: CALENDAR · MOVES · THIS EVENING · WAITING ON, tickable rows, one Record button", async () => {
  const task = { id: "flow:b:auto", title: "Collect the receipts", done: false, createdAt: now.toISOString(), plannedDate: "2026-09-19", plannedTime: "10:00", minutes: 20, deadline: "2026-09-25" };
  const evening = { id: "flow:c:auto", title: "Compare two insurance quotes", done: false, createdAt: now.toISOString(), plannedDate: "2026-09-19", plannedTime: "19:00" };
  const done = { id: "flow:d:auto", title: "Message Ali about the free app", done: true, completedAt: now.toISOString(), createdAt: now.toISOString(), plannedDate: "2026-09-19" };
  const events = [
    { id: "sync", calendarId: "c", title: "Team sync", start: "2026-09-19T15:00:00.000Z", end: "2026-09-19T15:45:00.000Z", allDay: false },
    { id: "mine", calendarId: "c", title: "Collect the receipts", start: "2026-09-19T16:00:00.000Z", end: "2026-09-19T16:20:00.000Z", allDay: false, mine: true, ref: "flow:b:auto" },
  ];
  const chase = { id: "flow:dui:chase", title: "Lawyer's follow-up", kind: "waiting", waitingOn: "the lawyer", chaseDate: "2026-09-19", done: false, createdAt: now.toISOString(), plannedDate: "" };
  const ticked = [], moved = [], opened = [];
  const view = await render(
    React.createElement(Today, {
      events, tasks: [task, evening, done, chase], now,
      tomorrow: [{ kind: "important", date: "2026-09-20", title: "Court hearing", note: "tomorrow · 10am" }],
      calendar: { connected: true, onConnect() {} },
      onTick: (t) => ticked.push(t.id), onOpenMove: (t) => opened.push(t.id), onTomorrow: (t) => moved.push(t.id), onEvening() {}, onDelete() {},
      onRecord() {}, onWrite() {}, onDismissNotice() {},
    }),
  );
  const found = labels(view);
  assert.equal(found.filter((l) => l === "Record").length, 1);
  assert.ok(!found.some((l) => /Library|My mind|Settings|Get to know me|Connect calendar|Your level|Something else/.test(l)));
  const text = textOf(view);
  for (const label of ["CALENDAR", "MOVES", "THIS EVENING", "WAITING ON"]) assert.match(text, new RegExp(`"${label}"`));
  assert.doesNotMatch(text, /TODAY'S PLAN|FLOW SUGGESTS|NEXT/);
  assert.match(text, /Team sync/);
  assert.ok(text.indexOf('"Collect the receipts"') < text.indexOf('"Compare two insurance quotes"'), "evening moves sit under THIS EVENING");
  assert.match(text, /"by Fri"/, "the due date is a pill, separate from the do-day");
  assert.match(text, /"the lawyer · chase Saturday"/);
  assert.match(text, /Court hearing/);
  assert.match(text, /"watch"/);
  const check = view.root.findAll((n) => n.props.accessibilityRole === "checkbox");
  assert.equal(check.length, 3, "every move is a tickable row");
  await act(async () => check[0].props.onPress());
  assert.deepEqual(ticked, ["flow:b:auto"]);
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === "Tomorrow")[0].props.onPress());
  assert.deepEqual(moved, ["flow:b:auto"], "swipe actions: Tomorrow · Evening · Delete");
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === "Open move Collect the receipts")[0].props.onPress());
  assert.deepEqual(opened, ["flow:b:auto"], "tap opens the move sheet");
  await act(async () => view.unmount());
  const off = await render(
    React.createElement(Today, { events: [], tasks: [], now, calendar: { connected: false, onConnect() {} }, onTick() {}, onOpenMove() {}, onTomorrow() {}, onEvening() {}, onDelete() {}, onRecord() {}, onWrite() {}, onDismissNotice() {} }),
  );
  assert.ok(labels(off).includes("Connect calendar"), "one row until the calendar is connected");
  assert.match(textOf(off), /Nothing planned for today/);
  await act(async () => off.unmount());
});

test("Recordings is Voicenotes' list with search, then projects with a ring; the tab bar is Today · Upcoming · Recordings · Me", async () => {
  const a = respondToRecording(suggestDraft("a", rich, now), "n1", rich, { now });
  const notes = [
    { id: "n1", title: "x", text: rich, createdAt: now.toISOString(), durationMs: 124_000 },
    { id: "n2", title: "y", text: "The landlord wants an answer on the lease.", createdAt: new Date(now.getTime() - 864e5).toISOString() },
  ];
  const tasks = [
    { id: "t1", noteId: "n1", projectId: "a", title: "Collect the receipts", done: false, createdAt: "", plannedDate: "" },
    { id: "t2", noteId: "n1", projectId: "a", title: "Email the accountant", done: true, createdAt: "", plannedDate: "" },
    { id: "t3", noteId: "n1", kind: "waiting", waitingOn: "the accountant", title: "Her numbers", done: false, createdAt: "", plannedDate: "" },
  ];
  const opened = [];
  const view = await render(React.createElement(Recordings, { notes, threads: [a], tasks, now, onOpenRecording: (n) => opened.push(n.id), onOpenProject: (id) => opened.push(id), onRecord() {}, onWrite() {} }));
  const text = textOf(view);
  assert.match(text, /"2 moves · 1 waiting · /, "what came of it, not the transcript");
  assert.match(text, /2:04/);
  assert.match(text, /"PROJECTS"/);
  assert.match(text, /"1 open/);
  assert.ok(labels(view).includes(`Open project ${a.title}`));
  assert.ok(labels(view).includes("Search") || view.root.findAll((n) => n.props.accessibilityLabel === "Search").length === 1);
  const rows = labels(view).filter((l) => l.startsWith("Open recording "));
  assert.equal(rows.length, 2);
  assert.ok(rows[0].includes(a.title), "newest first, titled by its project");
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === rows[0])[0].props.onPress());
  assert.deepEqual(opened, ["n1"]);
  await act(async () => view.unmount());
  const picked = [];
  const bar = await render(React.createElement(TabBar, { active: "today", onSelect: (t) => picked.push(t) }));
  const tabs = bar.root.findAllByType("Pressable").map((n) => n.props.accessibilityLabel);
  assert.deepEqual(tabs, ["Today", "Upcoming", "Recordings", "Me"]);
  await act(async () => bar.root.findAllByType("Pressable")[3].props.onPress());
  assert.deepEqual(picked, ["me"]);
  await act(async () => bar.unmount());
});

test("a recording page is Otter's: a paragraph, moves and waiting-ons as rows with ↗ to the words, Ask Flow; the transcript tab marks the evidence", async () => {
  const a = respondToRecording(suggestDraft("a", rich, now), "n1", rich, { now });
  const note = { id: "n1", title: "x", text: rich, createdAt: now.toISOString(), durationMs: 124_000, audioUri: "file:///a.m4a" };
  const tasks = [
    { id: "t1", noteId: "n1", projectId: "a", title: "Collect the receipts", done: false, createdAt: "", plannedDate: "2026-09-19", plannedTime: "10:00", notes: "I have to collect the receipts" },
    { id: "t3", noteId: "n1", kind: "waiting", waitingOn: "the accountant", title: "Her numbers", chaseDate: "2026-09-22", done: false, createdAt: "", plannedDate: "" },
  ];
  const asked = [];
  const view = await render(React.createElement(RecordingPage, { note, threads: [a], tasks, now, paragraph: "Taxes with the accountant before Friday; receipts first, then an email tonight.", onBack() {}, onTick() {}, onOpenMove() {}, onAsk: (id) => asked.push(id) }));
  let text = textOf(view);
  assert.match(text, /Taxes with the accountant before Friday/);
  assert.match(text, /"MOVES"/);
  assert.match(text, /"WAITING ON"/);
  assert.match(text, /"ASK FLOW"/);
  assert.match(text, /"the accountant: Her numbers"/);
  assert.match(text, /chase Tue/);
  assert.doesNotMatch(text, /finish the tax filing/, "the transcript is not on the summary page");
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === `Ask Flow about ${a.title}`)[0].props.onPress());
  assert.deepEqual(asked, ["a"]);
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === 'Show where "Collect the receipts" came from')[0].props.onPress());
  text = textOf(view);
  assert.match(text, /finish the tax filing/, "↗ lands on the transcript");
  assert.match(text, /"I have to collect the receipts"/, "the sentence behind the move is its own marked span");
  await act(async () => view.unmount());
});

test("Upcoming lists days with the phone's events and Flow's items; Your week is the same rows and ends with closure", async () => {
  const events = [
    { id: "sync", calendarId: "c", title: "Team sync", start: "2026-09-19T15:00:00.000Z", end: "2026-09-19T15:45:00.000Z", allDay: false, calendar: "Work" },
    { id: "court", calendarId: "c", title: "Court hearing", start: "2026-09-20T14:00:00.000Z", end: "2026-09-20T15:00:00.000Z", allDay: false, calendar: "Personal" },
  ];
  const tasks = [
    { id: "t1", title: "Follow up both lawyers", done: false, createdAt: "", plannedDate: "2026-09-20", plannedTime: "16:00" },
    { id: "t3", kind: "waiting", waitingOn: "the lawyer", title: "His answer", chaseDate: "2026-09-21", done: false, createdAt: "", plannedDate: "" },
  ];
  const opened = [];
  const view = await render(React.createElement(Upcoming, { events, tasks, connected: true, now, onConnect() {}, onOpenMove: (t) => opened.push(t.id), onRecord() {}, onWrite() {} }));
  const text = textOf(view);
  assert.match(text, /Work \+ Personal · Flow in blue/);
  assert.match(text, /"SAT 19"/);
  assert.match(text, /"TODAY"/);
  assert.match(text, /"SUN 20"/);
  assert.match(text, /Chase: the lawyer/);
  assert.match(text, /nothing planned yet/);
  assert.equal(labels(view).filter((l) => l === "Record").length, 1);
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === "Open move Follow up both lawyers")[0].props.onPress());
  assert.deepEqual(opened, ["t1"]);
  await act(async () => view.unmount());
  const plan = {
    noteId: "n", placements: [
      { item: { title: "Follow up both lawyers", kind: "action", area: "Legal" }, date: "2026-09-20", note: "court is at 10" },
      { item: { title: "Medical exams", kind: "later", area: "Health" } },
    ],
    events, tasks, projects: [{ id: "p", title: "DUI case", area: "Legal", fresh: true }], closure: "That's everything. Nothing left in your head.", summary: "Lawyers this week.", watch: [],
  };
  const week = await render(React.createElement(WeekPlan, { plan, now, onOpenProject() {}, onRecord() {}, onDone() {} }));
  const t = textOf(week);
  assert.match(t, /"Your week"/);
  assert.match(t, /2 things, all placed/);
  assert.match(t, /"PLACED AROUND YOUR WEEK"/);
  assert.match(t, /court is at 10/);
  assert.match(t, /Later: Medical exams/);
  assert.match(t, /Nothing left in your head/);
  assert.doesNotMatch(t, /✓ ✅/);
  assert.doesNotMatch(t, /And what else/);
  assert.ok(labels(week).includes("Looks right"));
  await act(async () => week.unmount());
});

test("a recording in a thread shows its breakdown, the summary sits on top, the transcript is one tap away", async () => {
  const dump = "I need to call the DUI lawyer tomorrow and send him the court letter. He is going to follow up with me.";
  let thread = respondToRecording(suggestDraft("dui", dump, now), "r1", dump, { now, quiet: true });
  thread = { ...thread, title: "DUI case", messages: thread.messages.map((m) => (m.kind === "transcript" ? { ...m, breakdown: { summary: "1 move · waiting on 1", items: [{ title: "Call the DUI lawyer", kind: "action", when: "Mon 10am" }, { title: "Lawyer's follow-up", kind: "waiting", person: "the lawyer", when: "chase Fri" }] } } : m)) };
  const tasks = [
    { id: "flow:dui:call", title: "Call the DUI lawyer", kind: "action", projectId: "dui", done: false, plannedDate: "2026-09-21", plannedTime: "10:00", createdAt: "" },
    { id: "flow:dui:wait", title: "Lawyer's follow-up", kind: "waiting", waitingOn: "the lawyer", chaseDate: "2026-09-25", projectId: "dui", done: false, plannedDate: "", createdAt: "" },
  ];
  const view = await render(React.createElement(ThreadChat, { thread, tasks, notes: [], mode: "builder", onRecord() {}, onSend() {}, onChip() {}, onClose() {} }));
  const text = textOf(view);
  assert.match(text, /SUMMARY/);
  assert.match(text, /WHAT FLOW GOT · ","1 MOVE · WAITING ON 1/);
  assert.match(text, /Mon 10am/);
  assert.match(text, /chase Fri/);
  assert.doesNotMatch(text, /I need to call the DUI lawyer tomorrow and send him/, "the raw words are not shown by default");
  assert.ok(labels(view).includes("Show transcript"));
  await act(async () => view.root.findAllByType("Pressable").find((n) => n.props.accessibilityLabel === "Show transcript").props.onPress());
  assert.match(textOf(view), /I need to call the DUI lawyer tomorrow/);
  await act(async () => view.unmount());
});

test("the move sheet: day, time, due and takes as chips, project as a field, save carries the patch, delete is there", async () => {
  const { default: MoveSheet } = await import("../src/components/MoveSheet.tsx");
  const task = { id: "t", title: "Call the DUI lawyer", topic: "Life", minutes: 20, done: false, plannedDate: "2026-09-19", plannedTime: "10:00", deadline: "", waitingOn: "", chaseDate: "", notes: "I have to reach out to the lawyer", createdAt: "", projectId: "p" };
  const projects = [{ ...suggestDraft("p", "DUI case", now), title: "DUI case" }, { ...suggestDraft("o", "x", now), title: "Other" }];
  const saved = [], deleted = [], opened = [];
  const view = await render(React.createElement(MoveSheet, { task, projects, now, onSave: (p) => saved.push(p), onDelete: () => deleted.push(1), onClose() {}, onOpenSource: () => opened.push(1) }));
  const text = textOf(view);
  for (const label of ["DAY", "TIME", "DUE", "TAKES"]) assert.match(text, new RegExp(`"${label}"`));
  assert.match(text, /Project: DUI case/);
  assert.match(text, /I have to reach out to the lawyer/);
  const tap = async (label) => act(async () => view.root.findAll((n) => n.props.accessibilityLabel === label)[0].props.onPress());
  await tap("Tomorrow");
  await tap("14:00");
  await tap("by Wed");
  await tap("30 min");
  await tap("Project: DUI case");
  assert.ok(labels(view).includes("None"), "the project field opens the live projects");
  assert.ok(!labels(view).includes("Other"), "area-named threads are not projects");
  await tap("Save");
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { title: "Call the DUI lawyer", plannedDate: "2026-09-20", plannedTime: "14:00", deadline: "2026-09-23", minutes: 30, projectId: "p" });
  await tap("Delete");
  assert.equal(deleted.length, 1);
  await act(async () => view.root.findAll((n) => n.props.accessibilityLabel === "From: “I have to reach out to the lawyer” ↗")[0].props.onPress());
  assert.equal(opened.length, 1);
  await act(async () => view.unmount());
});
