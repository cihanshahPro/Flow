import { test } from "node:test";
import assert from "node:assert/strict";
import { copyRecording } from "../src/copy-recording.ts";

const bytes = new Uint8Array([1, 2, 3, 4]);
function source() {
  return { uri: "src", exists: true, size: 4, copy() {}, create() {}, write() {}, arrayBuffer: async () => bytes.buffer };
}
// A destination whose native copy() does nothing, like iOS 26 did for the Retry-saving bug.
function dest({ nativeCopyWorks }) {
  const state = { exists: false, size: null, written: null };
  const file = {
    uri: "dst",
    get exists() { return state.exists; },
    get size() { return state.size; },
    copy() {},
    create() { state.exists = true; state.size = 0; },
    write(b) { state.written = b; state.size = b.length; },
    arrayBuffer: async () => bytes.buffer,
    state,
  };
  return { file, nativeCopyWorks, state };
}

test("native copy that works is used as is", async () => {
  const d = dest({ nativeCopyWorks: true });
  const src = source();
  src.copy = () => { d.state.exists = true; d.state.size = 4; };
  const out = await copyRecording(src, () => d.file);
  assert.equal(out.size, 4);
  assert.equal(d.state.written, null);
});

test("native copy that silently produces nothing falls back to writing bytes", async () => {
  const d = dest({ nativeCopyWorks: false });
  const out = await copyRecording(source(), () => d.file);
  assert.equal(out.size, 4);
  assert.deepEqual([...d.state.written], [1, 2, 3, 4]);
});

test("throws the save error when neither path produces a file", async () => {
  const d = dest({ nativeCopyWorks: false });
  d.file.write = () => {};
  await assert.rejects(copyRecording(source(), () => d.file), /could not be saved to this device/);
});
