import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
register("./processing-loader.mjs", import.meta.url);
const { processVoiceNote } = await import("../src/services/processing.ts");
const { shaperLog } = await import("../src/services/processors.ts");
const { harness } = await import("./processing-mocks.mjs");

// Release-like: no LAN processor, native module present, cloud configured.
globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_PROCESSOR_URL = "http://lan.invalid";
process.env.EXPO_PUBLIC_PROCESSOR_TOKEN = "secret";
process.env.EXPO_PUBLIC_SHAPE_URL = "https://shape.invalid";
process.env.EXPO_PUBLIC_FREE_SHAPE_QUOTA = "2";

const transcript = "Call Alex about the website. Then email the designer.";
const shape = {
  title: "Website project", summary: transcript, reply: "Alex and the website — got it.", question: "",
  points: [], choices: [{ label: "Contact Alex", action: "Call Alex about the website", smallAction: "Open Alex’s contact", evidence: "Call Alex about the website", reason: "You named it." }],
};
let n = 0;
const note = () => ({ id: `rec-${++n}`, audioUri: "file://saved.m4a", text: "", title: "Voice", createdAt: "2026-09-19T00:00:00Z" });
function device(llm) {
  const calls = [];
  harness.native = {
    capabilities: async () => ({ speech: true, llm, reason: llm ? "available" : "device-not-eligible" }),
    transcribe: async (uri) => (calls.push(["transcribe", uri]), transcript),
    shapeThought: async (text, ctx) => (calls.push(["shape", text, ctx]), JSON.stringify(shape)),
  };
  return calls;
}

test("Apple Intelligence phone: transcribes and shapes on device, no network at all", async () => {
  harness.reset();
  const calls = device(true);
  const draft = await processVoiceNote(note());
  assert.equal(harness.fetches, 0);
  assert.deepEqual(calls.map((c) => c[0]), ["transcribe", "shape"]);
  assert.equal(draft.organizer, "apple-local");
  assert.equal(shaperLog()[0].kind, "on-device");
});

test("older phone, first use: consent sheet once; Allow sends text only to the cloud", async () => {
  harness.reset();
  device(false);
  harness.cloud.body = { version: 1, shape };
  let asked = 0;
  const draft = await processVoiceNote(note(), { askCloudConsent: async () => (asked++, true) });
  assert.equal(asked, 1);
  assert.equal(harness.ai.consent, "allowed");
  assert.equal(draft.organizer, "cloud");
  const req = harness.requests[0];
  assert.equal(req.url, "https://shape.invalid/v1/shape");
  const body = JSON.parse(req.body);
  assert.equal(body.text, transcript);
  assert.ok(!("audio" in body) && typeof req.body === "string", "no audio in cloud request");
  assert.equal(req.headers.Authorization, undefined, "no embedded secret");
  assert.equal(harness.ai.quota.used, 1);
  await processVoiceNote(note(), { askCloudConsent: async () => (asked++, true) });
  assert.equal(asked, 1, "never asked twice");
});

test("Keep it basic: consent declined → template, nothing sent, not asked again", async () => {
  harness.reset();
  device(false);
  const draft = await processVoiceNote(note(), { askCloudConsent: async () => false });
  assert.equal(harness.ai.consent, "declined");
  assert.equal(harness.fetches, 0);
  assert.equal(draft.organizer, undefined);
  assert.equal(shaperLog()[0].reason, "cloud-consent-declined");
});

test("quota: spent after the configured limit, then template without network", async () => {
  harness.reset();
  device(false);
  harness.ai = { consent: "allowed" };
  harness.cloud.body = { version: 1, shape };
  await processVoiceNote(note());
  await processVoiceNote(note());
  assert.equal(harness.fetches, 2);
  harness.drafts = []; // keep the third recording from joining the earlier thread
  const draft = await processVoiceNote(note());
  assert.equal(harness.fetches, 2);
  assert.equal(draft.organizer, undefined);
  assert.equal(shaperLog()[0].reason, "cloud-quota-exhausted");
});

test("cloud failures fall back to the template and do not spend quota", async () => {
  for (const [status, body, fail] of [[500, null, null], [200, { version: 1, shape: {} }, null], [0, null, "network failed"]]) {
    harness.reset();
    device(false);
    harness.ai = { consent: "allowed" };
    harness.cloud = { status, body, fail };
    const draft = await processVoiceNote(note());
    assert.equal(draft.organizer, undefined);
    assert.equal(harness.ai.quota, undefined);
  }
  harness.reset();
  device(false);
  harness.ai = { consent: "allowed" };
  harness.cloud = { status: 402, body: { error: { code: "quota_exceeded", message: "" } }, fail: null };
  await processVoiceNote(note());
  assert.equal(harness.ai.quota.used, 2, "server quota mirrored locally");
});

test("release build ignores LAN env: no native speech means a clear error, never a LAN call", async () => {
  harness.reset();
  await assert.rejects(processVoiceNote(note()), /On-device transcription/);
  assert.equal(harness.fetches, 0);
});

test("a shaper that takes too long falls back to the template and logs the timeout", async () => {
  harness.reset();
  device(true);
  harness.native.shapeThought = () => new Promise(() => {}); // never answers
  const { shapeText } = await import("../src/services/processors.ts");
  const warn = console.warn;
  const warned = [];
  console.warn = (m) => warned.push(String(m));
  try {
    const out = await shapeText(transcript, null, { timeoutMs: 25 });
    assert.equal(out.shape, null);
    assert.equal(out.kind, "template");
    assert.match(out.reason, /timeout/);
    assert.equal(shaperLog()[0].outcome, "fallback");
    assert.equal(shaperLog()[0].detail, "timeout");
    assert.ok(warned.some((m) => /timed out/.test(m)), "the fallback is logged");
  } finally {
    console.warn = warn;
  }
});

test("cancelling while Flow thinks uses the template right away", async () => {
  harness.reset();
  device(true);
  harness.native.shapeThought = () => new Promise(() => {});
  const { shapeText } = await import("../src/services/processors.ts");
  const abort = new AbortController();
  const pending = shapeText(transcript, null, { signal: abort.signal, timeoutMs: 60_000 });
  setTimeout(() => abort.abort(), 10);
  const out = await pending;
  assert.equal(out.shape, null);
  assert.equal(shaperLog()[0].detail, "cancelled");
});
