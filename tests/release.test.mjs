import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const check = (id, project = "00000000-0000-4000-8000-000000000001") =>
  spawnSync(process.execPath, ["scripts/check-release.mjs"], {
    env: { ...process.env, APP_BUNDLE_ID: id, EAS_PROJECT_ID: project },
  }).status;
test("store preflight rejects unset and placeholder identifiers", () => {
  assert.equal(check(""), 1);
  assert.equal(check("com.example.anchor"), 1);
});
test("store preflight rejects underscores and missing project identity", () => {
  assert.equal(check("com.sample.bad_name"), 1);
  assert.equal(check("com.sample.anchor", ""), 1);
});
test("store preflight accepts a configured identifier shape", () =>
  assert.equal(check("com.sample.anchor"), 0));
