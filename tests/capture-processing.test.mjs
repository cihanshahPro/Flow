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

test("explicit and legacy thoughts retain the existing draft path", async () => {
  for (const captureKind of [undefined, "thought"]) {
    harness.reset();
    const saved = recording({ captureKind, direction });
    const result = await processCapturedNote(saved);
    assert.equal(result.kind, "draft");
    assert.equal(result.draft.source, transcript);
    assert.deepEqual(result.draft.direction, direction);
    assert.deepEqual(harness.writes, ["transcript", "draft"]);
    assert.deepEqual(await processCapturedNote(saved), result);
    assert.equal(harness.requests.filter((r) => r.body?.uri).length, 1, "audio uploaded once");
  }
});

test("thought draft-write retry uses stored transcription with its capture kind and original audio", async () => {
  harness.reset();
  const saved = recording({ captureKind: "thought", direction });
  harness.failDraft = true;
  await assert.rejects(processCapturedNote(saved), /storage busy/);
  assert.deepEqual(harness.notes, [{ ...saved, text: transcript }]);
  harness.failDraft = false;
  const result = await processCapturedNote(saved);
  assert.equal(result.kind, "draft");
  assert.equal(
    harness.requests.filter(
      (request) =>
        request.headers["Content-Type"] === "application/octet-stream",
    ).length,
    1,
  );
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
