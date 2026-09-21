import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
register("./processing-loader.mjs", import.meta.url);
register("./voice-loader.mjs", import.meta.url);
const { harness } = await import("./processing-mocks.mjs");
const { processCapturedNote } = await import("../src/services/processing.ts");
const { default: Today } = await import("../src/components/Today.tsx");
const { default: Threads } = await import("../src/components/Threads.tsx");
process.env.EXPO_PUBLIC_PROCESSOR_URL = "http://testing.invalid";
process.env.EXPO_PUBLIC_PROCESSOR_TOKEN = "test";

/**
 * The owner's real phone, as mirrored on 21 Sep 2026: six recordings in the
 * order he made them (the two-minute dump, a follow-up dump, two messages
 * inside "My DEY case", two messages inside another thread). They run through
 * the app's own path with the local floor (no model), so nothing here depends
 * on a brain being reachable. This is the complicated real-life scenario the
 * app must survive; new snapshots of his phone go next to this one.
 */
const phone = JSON.parse(readFileSync(new URL("./fixtures/owner/phone-2026-09-21.json", import.meta.url), "utf8"));

test("the owner's six real recordings go through the app in order without a brain and leave a usable week", async () => {
  harness.reset();
  harness.events = [
    { id: "court", calendarId: "c", title: "Court hearing", start: "2026-09-21T14:00:00.000Z", end: "2026-09-21T15:00:00.000Z", allDay: false },
    { id: "nyc", calendarId: "c", title: "Flight to NYC", start: "2026-09-23T00:00:00.000Z", end: "2026-09-24T00:00:00.000Z", allDay: true },
  ];
  const results = [];
  const allNotes = [];
  for (const [i, r] of phone.recordings.entries()) {
    const note = { id: `owner-${i}`, captureKind: "thought", title: r.text.slice(0, 40), text: r.text, createdAt: r.createdAt, ...(r.planId ? { planId: harness.drafts[0]?.id } : {}) };
    harness.notes = [...harness.notes, note];
    allNotes.push(note);
    results.push(await processCapturedNote(note, { now: new Date(r.createdAt) }));
  }
  const dump = results[0];
  assert.equal(dump.kind, "intake", "the first two-minute dump is an intake");
  assert.ok(dump.plan.placements.length >= 3, `the dump yields moves, got ${dump.plan.placements.length}`);
  assert.ok(dump.plan.projects.length >= 2, "and at least two projects (the lawyers, the app portfolio)");
  assert.ok(harness.tasks.every((t) => t.title && t.title.length <= 120), "every move has a title");
  assert.ok(!harness.tasks.some((t) => /^(Other|Work|Legal & admin)$/.test(t.title)), "no move is named after an area");
  assert.ok(harness.drafts.every((d) => !/And what else\?/.test(d.messages.at(-1)?.text ?? "")), "no thread ends on 'And what else?'");
  // The follow-up dump adds, never duplicates.
  const titles = harness.tasks.map((t) => t.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length, "no duplicate moves across his recordings");
  // Messages inside a thread stay in that thread and get an answer.
  const dey = harness.drafts.find((d) => /DEY|DUI/i.test(d.title)) ?? harness.drafts[0];
  assert.ok(dey.messages.filter((m) => m.from === "flow").length >= 2, "Flow answered inside the thread");
  // Today and Threads render his data without throwing.
  const React = (await import("react")).default;
  const renderer = (await import("react-test-renderer")).default;
  const { act } = await import("react-test-renderer");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let view;
  await act(async () => {
    view = renderer.create(React.createElement(Today, { events: harness.events, tasks: harness.tasks, now: new Date("2026-09-21T13:00:00.000Z"), onTick() {}, onOpenMove() {}, onTomorrow() {}, onEvening() {}, onDelete() {}, onRecord() {}, onWrite() {}, onDismissNotice() {} }));
  });
  assert.match(JSON.stringify(view.toJSON()), /"MOVES"/);
  await act(async () => view.unmount());
  await act(async () => {
    view = renderer.create(React.createElement(Threads, { notes: allNotes, threads: harness.drafts, tasks: harness.tasks, now: new Date("2026-09-21T13:00:00.000Z"), onOpenThread() {}, onOpenRecording() {}, onRecord() {}, onWrite() {} }));
  });
  const text = JSON.stringify(view.toJSON());
  assert.match(text, /"RECORDINGS"/);
  assert.doesNotMatch(text, /Play recording/);
  await act(async () => view.unmount());
});
