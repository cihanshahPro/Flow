import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoiceServer } from "../scripts/voice-server.mjs";
const token = "test-only-authorization-token-123456789";
async function server(t, transcribe, shape) {
  const s = createVoiceServer({ token, transcribe, shape, log: () => {} });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(() => {
    s.closeAllConnections();
    s.close();
  });
  return "http://127.0.0.1:" + s.address().port + "/process";
}
const send = (url, body = "audio") =>
  fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body,
  });
test("processor requires pairing before running transcription", async (t) => {
  let calls = 0;
  const url = await server(t, async () => {
    calls++;
    return "hello";
  });
  assert.equal(
    (await fetch(url, { method: "POST", body: "audio" })).status,
    401,
  );
  assert.equal(calls, 0);
});
test("one recording produces a transcript and empty speech is not invented", async (t) => {
  const url = await server(t, async (bytes) =>
    bytes.toString() === "silence" ? "[BLANK_AUDIO]" : "Call Alex.",
  );
  assert.equal((await (await send(url)).json()).text, "Call Alex.");
  assert.equal((await send(url, "silence")).status, 422);
  assert.equal((await send(url, "")).status, 400);
});
test("processor errors release the worker for a retry", async (t) => {
  let fail = true;
  const url = await server(t, async () => {
    if (fail) throw Error("engine failure");
    return "Email Alex.";
  });
  assert.equal((await send(url)).status, 503);
  fail = false;
  assert.equal((await send(url)).status, 200);
});
test("concurrent recording gets a retryable response rather than parallel CPU work", async (t) => {
  let release;
  const url = await server(
    t,
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const first = send(url);
  while (!release) await new Promise((r) => setImmediate(r));
  assert.equal((await send(url)).status, 503);
  release("Call Alex.");
  assert.equal((await first).status, 200);
});

test("text and audio share one route, and organizer failure keeps the transcript", async (t) => {
  let calls = 0,
    fail = false;
  const url = await server(
    t,
    async () => {
      calls++;
      return "Call Alex.";
    },
    async (text) => {
      if (fail) throw Error("unavailable");
      return { title: text, summary: text, choices: [] };
    },
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: "Email Alex." }),
  });
  const result = await response.json();
  assert.equal(calls, 0);
  assert.equal(result.shape.title, "Email Alex.");
  assert.equal(result.organizer, "apple-local");
  fail = true;
  const audio = await (await send(url)).json();
  assert.equal(audio.text, "Call Alex.");
  assert.equal(audio.organizer, "unavailable");
  assert.equal(calls, 1);
});
