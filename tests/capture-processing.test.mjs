import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

register("./processing-loader.mjs", import.meta.url);
const { processCapturedNote, processVoiceNote } =
  await import("../src/services/processing.ts");
const { harness } = await import("./processing-mocks.mjs");

process.env.EXPO_PUBLIC_PROCESSOR_URL = "http://testing.invalid";
process.env.EXPO_PUBLIC_PROCESSOR_TOKEN = "test";
// These suites exercise the development-only LAN processor.
globalThis.__DEV__ = true;

const recording = (extra = {}) => ({
  id: "capture",
  audioUri: "file://saved.m4a",
  durationMs: 1234,
  text: "",
  title: "A saved capture",
  createdAt: "2026-09-18T00:00:00Z",
  ...extra,
});
const direction = {
  directionId: "work:Build something",
  areaId: "work",
  choice: "Build something",
};
const transcript = "Call Alex about the website. Then email the designer.";

for (const captureKind of ["note", "feedback"]) {
  test(`${captureKind} audio saves its transcript and never turns returned AI output into a plan`, async () => {
    harness.reset();
    const saved = recording({
      captureKind,
      direction,
      planId: "unrelated-plan",
    });
    harness.notes = [structuredClone(saved)];
    harness.shape = { title: "A server suggestion that must be ignored" };
    const result = await processCapturedNote(saved);
    assert.equal(result.kind, "note");
    assert.deepEqual(result.note, { ...saved, text: transcript });
    assert.deepEqual(harness.notes, [result.note]);
    assert.deepEqual(harness.writes, ["transcript"]);
    assert.deepEqual(harness.drafts, []);
    assert.equal(harness.requests.length, 1);
    assert.equal(
      harness.requests[0].headers["Content-Type"],
      "application/octet-stream",
    );
    assert.equal(harness.requests[0].body.uri, saved.audioUri);
    // Retry from the original stale object reuses persisted text, even offline.
    harness.offline = true;
    assert.deepEqual(await processCapturedNote(saved), result);
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(harness.drafts, []);
  });

  test(`${captureKind} text remains local and unchanged without invoking transcription or organization`, async () => {
    harness.reset();
    harness.offline = true;
    const text = "  Keep these exact words, including their spacing.  ";
    const saved = recording({ captureKind, audioUri: undefined, text });
    const result = await processCapturedNote(saved);
    assert.deepEqual(result, { kind: "note", note: saved });
    assert.equal(harness.fetches, 0);
    assert.deepEqual(harness.drafts, []);
    assert.deepEqual(harness.writes, ["transcript"]);
  });

  test(`${captureKind} processing failure preserves the original and can retry`, async () => {
    harness.reset();
    const saved = recording({ captureKind });
    harness.notes = [structuredClone(saved)];
    harness.offline = true;
    await assert.rejects(processCapturedNote(saved), /development processor/);
    assert.deepEqual(harness.notes, [saved]);
    assert.deepEqual(harness.writes, []);
    assert.deepEqual(harness.drafts, []);
    harness.offline = false;
    assert.equal((await processCapturedNote(saved)).note.text, transcript);
    assert.deepEqual(harness.drafts, []);
  });
}

test("persisted capture kind prevents a stale thought caller from converting a note", async () => {
  harness.reset();
  harness.notes = [recording({ captureKind: "note", text: transcript })];
  const existing = { id: "unrelated", title: "Existing plan" };
  harness.drafts = [existing];
  const result = await processCapturedNote(
    recording({ captureKind: "thought" }),
  );
  assert.equal(result.kind, "note");
  assert.equal(result.note.captureKind, "note");
  assert.deepEqual(harness.drafts, [existing]);
  assert.equal(harness.fetches, 0);
  await assert.rejects(processVoiceNote(recording()), /not a plan/);
  assert.deepEqual(harness.drafts, [existing]);
});

test("a thought from Today is read into the week plan: a project thread, a placed move on the calendar, nothing asked", async () => {
  for (const captureKind of [undefined, "thought"]) {
    harness.reset();
    const saved = recording({ captureKind, direction });
    const result = await processCapturedNote(saved);
    assert.equal(result.kind, "intake");
    const plan = result.plan;
    assert.ok(plan.placements.length >= 1);
    assert.equal(plan.source, "local", "no model answered: the local pass planned it");
    assert.match(plan.closure, /That's everything/);
    assert.ok(plan.projects.length >= 1);
    const thread = harness.drafts.find((d) => d.id === plan.projects[0].id);
    assert.ok(thread, "a thread per project");
    assert.deepEqual(thread.sourceNoteIds, [saved.id]);
    assert.equal(thread.messages.filter((m) => m.kind === "question").length, 0, "quiet: the intake never asks");
    const move = harness.tasks.find((t) => t.kind === "action");
    assert.ok(move, "a move");
    assert.ok(move.plannedDate && move.plannedTime, "placed in a gap");
    assert.ok(move.eventId, "written to the phone");
    assert.equal(harness.calendarWrites.filter((w) => w.kind === "event").length, harness.tasks.filter((t) => t.eventId).length);
    // The same note again is not planned twice.
    const again = await processCapturedNote(saved);
    assert.equal(again.kind, "draft");
    assert.equal(again.draft.id, thread.id);
    assert.equal(harness.requests.filter((r) => r.body?.uri).length, 1, "audio uploaded once");
  }
});

test("a draft-write failure during the intake surfaces, and the retry uses the stored transcript without re-uploading", async () => {
  harness.reset();
  const saved = recording({ captureKind: "thought", direction });
  harness.failDraft = true;
  await assert.rejects(processCapturedNote(saved), /storage busy/);
  assert.deepEqual(harness.notes, [{ ...saved, text: transcript }]);
  harness.failDraft = false;
  const result = await processCapturedNote(saved);
  assert.equal(result.kind, "intake");
  assert.equal(harness.requests.filter((request) => request.headers["Content-Type"] === "application/octet-stream").length, 1);
  assert.deepEqual(harness.notes, [{ ...saved, text: transcript }]);
});

test("a thought update stays attached to its original plan and is idempotent", async () => {
  harness.reset();
  const plan = {
    id: "plan",
    title: "Original plan",
    source: "My original thought",
    topic: "Work",
    updates: [],
    state: "draft",
    direction,
    createdAt: "2026-09-17T12:00:00Z",
    steps: [
      {
        id: "chosen",
        title: "Review the original plan",
        minutes: 5,
        accepted: true,
      },
    ],
  };
  harness.drafts = [structuredClone(plan)];
  const saved = recording({
    captureKind: "thought",
    planId: plan.id,
    direction,
  });
  const result = await processCapturedNote(saved);
  assert.equal(result.kind, "draft");
  assert.equal(result.draft.id, plan.id);
  assert.equal(result.draft.source, plan.source);
  assert.deepEqual(result.draft.steps[0], plan.steps[0]);
  assert.deepEqual(result.draft.sourceNoteIds, [saved.id]);
  assert.deepEqual(result.draft.updates, [transcript]);
  assert.deepEqual(harness.notes, [{ ...saved, text: transcript }]);
  assert.deepEqual(await processCapturedNote(saved), result);
  assert.equal(harness.requests.filter((r) => r.body?.uri).length, 1, "audio uploaded once");
  assert.deepEqual(harness.writes, ["transcript", "draft"]);
});

test("an empty non-audio capture fails without writing a note or plan", async () => {
  harness.reset();
  await assert.rejects(
    processCapturedNote(
      recording({ captureKind: "note", audioUri: undefined }),
    ),
    /no recording/,
  );
  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.drafts, []);
});

const OWNER = new URL("./fixtures/owner-dump-1.txt", import.meta.url);

test("the owner's dump through the model plan: kinds, people, dates and projects land on the map and around the calendar", async () => {
  harness.reset();
  const fs = await import("node:fs");
  const dump = fs.readFileSync(OWNER, "utf8").trim();
  const now = new Date("2026-09-21T08:00:00"); // Monday
  const day = (n, h = 0, m = 0) => new Date(2026, 8, 21 + n, h, m).toISOString();
  harness.events = [
    { id: "court", calendarId: "c", title: "Court hearing", start: day(1, 10), end: day(1, 11, 30), allDay: false },
    { id: "nyc", calendarId: "c", title: "Flight to NYC", start: day(3), end: day(4), allDay: true },
    { id: "bday", calendarId: "c", title: "Mum's birthday", start: day(5), end: day(6), allDay: true },
  ];
  harness.plan = {
    items: [
      { title: "Call the DUI lawyer", kind: "action", project: "DUI case", area: "Legal & admin", person: "the lawyer", when: "this Monday", evidence: "talk to a lawyer" },
      { title: "Follow up both lawyers", kind: "action", project: "DUI case", area: "Legal & admin", when: "tomorrow", evidence: "do follow-ups tomorrow" },
      { title: "Lawyer's follow-up", kind: "waiting", project: "DUI case", area: "Legal & admin", person: "the lawyer", evidence: "going to follow up with me" },
      { title: "Medical exams", kind: "later", project: "Green card", area: "Legal & admin", evidence: "Do medical exams" },
      { title: "Message a friend about a free app", kind: "action", project: "App portfolio", area: "Work", person: "a friend", evidence: "do a free app for him" },
      { title: "Invoices from the guy", kind: "waiting", project: "Amazon FBA", area: "Work", person: "the guy", evidence: "supposed to give me noises" },
    ],
  };
  const saved = recording({ captureKind: "thought", text: dump, audioUri: undefined, id: "owner" });
  harness.notes = [structuredClone(saved)];
  const result = await processCapturedNote(saved, { now });
  assert.equal(result.kind, "intake");
  const plan = result.plan;
  assert.equal(plan.source, "model");
  assert.deepEqual(plan.projects.map((p) => p.title), ["DUI case", "Green card", "App portfolio", "Amazon FBA"]);
  assert.equal(plan.watch.some((w) => /court/i.test(w.title)), true, "the court date is a watch-out before the person says a word");
  assert.equal(plan.watch.some((w) => w.kind === "occasion"), true, "mum's birthday with nothing planned");
  const byTitle = (t) => plan.placements.find((p) => p.item.title === t);
  assert.equal(byTitle("Call the DUI lawyer").date, "2026-09-21");
  assert.equal(byTitle("Follow up both lawyers").date, "2026-09-22", "tomorrow, after the court slot");
  assert.ok(byTitle("Follow up both lawyers").slot.start >= harness.events[0].end, "placed after court, not in the hour before it");
  assert.ok(byTitle("Lawyer's follow-up").chaseDate >= "2026-09-24");
  assert.notEqual(byTitle("Lawyer's follow-up").chaseDate, "2026-09-24", "the chase dodges the NYC day");
  assert.equal(byTitle("Medical exams").date, undefined, "later stays off the calendar");
  const chases = harness.calendarWrites.filter((w) => w.kind === "reminder");
  assert.equal(chases.length, 2, "two chases in Reminders");
  assert.equal(harness.tasks.filter((t) => t.kind === "waiting").every((t) => t.reminderId), true);
  const dui = harness.drafts.find((d) => d.title === "DUI case");
  assert.deepEqual(dui.people, ["the lawyer"]);
  assert.equal(dui.area, "Legal & admin");
  assert.ok(harness.tasks.some((t) => t.projectId === dui.id));
});

test("a later dump attaches to the projects it names instead of starting new ones", async () => {
  harness.reset();
  const { respondToRecording } = await import("../src/thread.ts");
  const { suggestDraft } = await import("../src/drafts.ts");
  const dui = respondToRecording({ ...suggestDraft("dui", "The first one is regarding my DUI case, so I have to reach out to the lawyer."), title: "DUI case", area: "Legal & admin", people: ["the lawyer"] }, "d0", "The first one is regarding my DUI case, so I have to reach out to the lawyer.", { quiet: true });
  harness.drafts = [dui];
  harness.plan = { items: [{ title: "Send the lawyer the court letter", kind: "action", project: "DUI case", area: "Legal & admin", person: "the lawyer", evidence: "send the lawyer the court letter" }] };
  const saved = recording({ captureKind: "thought", text: "The lawyer called back, I need to send the lawyer the court letter.", audioUri: undefined, id: "later" });
  harness.notes = [structuredClone(saved)];
  const result = await processCapturedNote(saved);
  assert.equal(result.kind, "intake");
  assert.deepEqual(result.plan.projects.map((p) => [p.id, p.fresh]), [["dui", false]]);
  assert.equal(harness.drafts.length, 1, "no new thread");
  assert.equal(harness.drafts[0].messages.filter((m) => m.kind === "transcript").length, 2, "the words went to the DUI thread");
  assert.ok(harness.tasks[0].id.startsWith("flow:dui:"));
});

test("saying the same things again adds nothing twice: no repeated passage, no duplicate move", async () => {
  harness.reset();
  const dump = "I need to call the DUI lawyer tomorrow. Also start the app portfolio, a free app for Ali first.";
  harness.plan = { items: [
    { title: "Call the DUI lawyer", kind: "action", project: "DUI case", area: "Legal & admin", person: "the lawyer", when: "tomorrow", evidence: "call the DUI lawyer tomorrow" },
    { title: "Start the app portfolio", kind: "action", project: "App portfolio", area: "Work", person: "Ali", evidence: "start the app portfolio" },
  ] };
  harness.notes = [{ id: "r1", captureKind: "thought", text: dump, createdAt: "2026-09-20T18:00:00Z" }];
  await processCapturedNote(harness.notes[0]);
  const tasksAfterFirst = harness.tasks.length;
  harness.notes = [...harness.notes, { id: "r2", captureKind: "thought", text: dump + " That's all.", createdAt: "2026-09-20T19:00:00Z" }];
  harness.plan = { items: [
    { title: "Call the lawyer about the DUI", kind: "action", project: "DUI case", area: "Legal & admin", person: "the lawyer", when: "tomorrow", evidence: "call the DUI lawyer tomorrow" },
    { title: "Start the app portfolio", kind: "action", project: "App portfolio", area: "Work", person: "Ali", evidence: "start the app portfolio" },
  ] };
  const again = await processCapturedNote(harness.notes[1]);
  assert.equal(again.kind, "intake");
  assert.equal(harness.drafts.length, 2, "same two projects");
  assert.equal(harness.tasks.length, tasksAfterFirst, "no duplicate moves");
  const dui = harness.drafts.find((d) => d.title === "DUI case");
  assert.equal(dui.messages.filter((m) => m.kind === "transcript").length, 1, "the repeated sentence did not land twice");
});
