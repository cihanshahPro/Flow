import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
register("./processing-loader.mjs", import.meta.url);
const { processVoiceNote, createThoughtDraft } =
  await import("../src/services/processing.ts");
const { harness } = await import("./processing-mocks.mjs");
process.env.EXPO_PUBLIC_PROCESSOR_URL = "http://testing.invalid";
process.env.EXPO_PUBLIC_PROCESSOR_TOKEN = "test";
// These suites exercise the development-only LAN processor.
globalThis.__DEV__ = true;
const note = {
  id: "recording",
  audioUri: "file://saved.m4a",
  text: "",
  title: "Voice note",
  createdAt: "2026-09-18T00:00:00Z",
};
const direction = {
  directionId: "work:client-project",
  areaId: "work",
  choice: "Build a client project",
};
const transcript = "Call Alex about the website. Then email the designer.";
const shape = {
  title: "Website project",
  summary: transcript,
  choices: [
    {
      label: "Contact Alex",
      action: "Call Alex about the website",
      smallAction: "Open Alex’s contact",
      reason: "Start with the first action you named.",
      evidence: "Call Alex about the website",
    },
  ],
};
test("saved audio becomes a persisted transcript then one draft; repeat processing is idempotent", async () => {
  harness.reset();
  const draft = await processVoiceNote(note);
  assert.deepEqual(harness.writes, ["transcript", "draft"]);
  assert.equal(draft.steps.length, 2);
  assert.equal(harness.notes[0].audioUri, note.audioUri);
  const fetches = harness.fetches;
  assert.deepEqual(await processVoiceNote(note), draft);
  assert.equal(harness.fetches, fetches);
});
test("draft-write retry reuses the persisted transcript instead of retranscribing", async () => {
  harness.reset();
  harness.failDraft = true;
  await assert.rejects(processVoiceNote(note), /storage busy/);
  assert.ok(harness.notes[0].text);
  harness.failDraft = false;
  await processVoiceNote(note);
  assert.equal(
    harness.requests.filter(
      (r) => r.headers["Content-Type"] === "application/octet-stream",
    ).length,
    1,
  );
  assert.equal(
    harness.requests.filter(
      (r) => r.headers["Content-Type"] === "application/json",
    ).length,
    2, // each attempt reshapes the saved text; audio is uploaded once
  );
});
test("unreachable processor does not change or erase the original recording", async () => {
  harness.reset();
  harness.notes = [structuredClone(note)];
  harness.offline = true;
  await assert.rejects(processVoiceNote(note), /development processor/);
  assert.deepEqual(harness.notes, [note]);
  assert.deepEqual(harness.writes, []);
});

test("audio processing carries persisted direction into the transcript and grounded draft", async () => {
  harness.reset();
  harness.notes = [{ ...note, direction }];
  harness.shape = shape;
  // The caller may have a stale note object; saved context is authoritative.
  const draft = await processVoiceNote(note);
  assert.deepEqual(harness.notes[0].direction, direction);
  assert.deepEqual(harness.drafts[0].direction, direction);
  assert.deepEqual(draft.direction, direction);
  assert.equal(draft.source, transcript);
  assert.equal(draft.organizer, "apple-local");
  assert.equal(harness.requests[0].body.uri, note.audioUri);
  assert.equal(harness.requests[0].body.direction, undefined);
});

test("draft-write retry retains direction without adding it to source or the text request", async () => {
  harness.reset();
  harness.notes = [{ ...note, direction }];
  harness.failDraft = true;
  await assert.rejects(processVoiceNote(note), /storage busy/);
  harness.failDraft = false;
  harness.shape = shape;
  const draft = await processVoiceNote(note);
  assert.deepEqual(draft.direction, direction);
  assert.equal(draft.source, transcript);
  const textRequest = harness.requests.find(
    (r) => r.headers["Content-Type"] === "application/json",
  );
  assert.deepEqual(JSON.parse(textRequest.body), { text: transcript });
  assert.equal(
    harness.requests.filter(
      (r) => r.headers["Content-Type"] === "application/octet-stream",
    ).length,
    1,
  );
});

test("invalid organizer output preserves direction in the basic audio draft", async () => {
  harness.reset();
  harness.shape = {
    ...shape,
    choices: [{ ...shape.choices[0], evidence: "invented evidence" }],
  };
  const draft = await processVoiceNote({ ...note, direction });
  assert.deepEqual(draft.direction, direction);
  assert.equal(draft.source, transcript);
  assert.equal(draft.organizer, undefined);
});

test("typed thoughts keep context locally for AI and offline drafts without changing their words", async () => {
  harness.reset();
  harness.shape = shape;
  const organized = await createThoughtDraft("typed", transcript, direction);
  assert.deepEqual(organized.direction, direction);
  assert.equal(organized.source, transcript);
  assert.deepEqual(JSON.parse(harness.requests[0].body), { text: transcript });
  harness.offline = true;
  const fallback = await createThoughtDraft("offline", transcript, direction);
  assert.deepEqual(fallback.direction, direction);
  assert.equal(fallback.source, transcript);
  const unrelated = await createThoughtDraft("unrelated", transcript);
  assert.equal(unrelated.direction, undefined);
});

test("a processed recording opens a conversation: transcript, Flow's reply, and one question", async () => {
  harness.reset();
  const draft = await processVoiceNote(note);
  const kinds = draft.messages.map((m) => `${m.from}:${m.kind}`);
  assert.deepEqual(kinds, ["you:transcript", "flow:ack", "flow:question"]);
  assert.equal(draft.messages[0].text, transcript);
  assert.equal(draft.messages[0].noteId, note.id);
  assert.equal(draft.threadPoints.length, 7);
});

test("the shaper's reply, question and grounded evidence shape Flow's turn; ungrounded evidence is ignored", async () => {
  harness.reset();
  harness.shape = {
    ...shape,
    reply: "Alex and the designer — got it.",
    question: "When does the designer need the brief?",
    points: [
      { id: "people", evidence: "Call Alex" },
      { id: "timing", evidence: "by next Tuesday" },
    ],
  };
  const draft = await processVoiceNote(note);
  assert.equal(draft.messages[1].text, "Alex and the designer — got it.");
  assert.equal(draft.messages[2].text, "When does the designer need the brief?");
  assert.equal(draft.threadPoints.find((p) => p.id === "people").state, "known");
  assert.equal(draft.threadPoints.find((p) => p.id === "timing").state, "missing");
});

test("a new recording without a plan joins the open thread that shares its words", async () => {
  harness.reset();
  const first = await processVoiceNote(note);
  harness.drafts = [first];
  harness.notes = [];
  const second = await processVoiceNote({ ...note, id: "recording-2", audioUri: "file://second.m4a" });
  assert.equal(second.id, first.id, "same thread");
  assert.deepEqual(second.sourceNoteIds, ["recording-2"]);
  assert.equal(second.messages.filter((m) => m.kind === "transcript").length, 2);
  assert.equal(second.source, first.source, "original words untouched");
});
