import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
register("./processing-loader.mjs", import.meta.url);
const { processVoiceNote } = await import("../src/services/processing.ts");
const { harness } = await import("./processing-mocks.mjs");
process.env.EXPO_PUBLIC_PROCESSOR_URL = "http://testing.invalid";
process.env.EXPO_PUBLIC_PROCESSOR_TOKEN = "test";
const note = {
  id: "recording",
  audioUri: "file://saved.m4a",
  text: "",
  title: "Voice note",
  createdAt: "2026-09-18T00:00:00Z",
};
test("saved audio becomes a persisted transcript then one draft; repeat processing is idempotent", async () => {
  harness.reset();
  const draft = await processVoiceNote(note);
  assert.deepEqual(harness.writes, ["transcript", "draft"]);
  assert.equal(draft.steps.length, 2);
  assert.equal(harness.notes[0].audioUri, note.audioUri);
  assert.deepEqual(await processVoiceNote(note), draft);
  assert.equal(harness.fetches, 1);
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
    1,
  );
});
test("unreachable processor does not change or erase the original recording", async () => {
  harness.reset();
  harness.notes = [structuredClone(note)];
  harness.offline = true;
  await assert.rejects(processVoiceNote(note), /same Wi-Fi/);
  assert.deepEqual(harness.notes, [note]);
  assert.deepEqual(harness.writes, []);
});
