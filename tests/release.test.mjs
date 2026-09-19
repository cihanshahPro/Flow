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

import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const script = resolve("scripts/check-release.mjs");
const ids = { APP_BUNDLE_ID: "com.sample.anchor", EAS_PROJECT_ID: "00000000-0000-4000-8000-000000000001" };
const clean = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("EXPO_PUBLIC_PROCESSOR") && k !== "EAS_BUILD_PROFILE"),
);
const run = (env, args = [], cwd = mkdtempSync(join(tmpdir(), "flow-rel-"))) =>
  spawnSync(process.execPath, [script, ...args], { cwd, env: { ...clean, ...ids, ...env } }).status;

test("release preflight refuses the development LAN processor token or URL", () => {
  assert.equal(run({}), 0);
  assert.equal(run({ EXPO_PUBLIC_PROCESSOR_TOKEN: "abc123" }), 1);
  assert.equal(run({ EXPO_PUBLIC_PROCESSOR_URL: "http://192.168.1.2:8787" }), 1);
  assert.equal(run({ EXPO_PUBLIC_PROCESSOR_TOKEN: "abc123", EAS_BUILD_PROFILE: "development" }), 0);
  const cwd = mkdtempSync(join(tmpdir(), "flow-rel-"));
  writeFileSync(join(cwd, ".env"), "EXPO_PUBLIC_PROCESSOR_TOKEN=abc123\n");
  assert.equal(run({ EAS_BUILD_PROFILE: "production" }, [], cwd), 1);
});

test("bundle scan fails when the LAN token or key name is in exported JS", () => {
  const dir = mkdtempSync(join(tmpdir(), "flow-bundle-"));
  writeFileSync(join(dir, "index.js"), "console.log('hello')");
  assert.equal(run({ EXPO_PUBLIC_PROCESSOR_TOKEN: "s3cret-token" }, ["--bundle", dir]), 0);
  writeFileSync(join(dir, "leak.js"), "var t='s3cret-token'");
  assert.equal(run({ EXPO_PUBLIC_PROCESSOR_TOKEN: "s3cret-token" }, ["--bundle", dir]), 1);
});

test("app code reads the LAN processor env only behind a __DEV__ guard", () => {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.(ts|tsx)$/.test(f)) files.push(f);
    }
  };
  walk("src");
  walk("modules");
  files.push("App.tsx", "ClassicFlow.tsx", "LegacyApp.tsx");
  const users = files.filter((f) => readFileSync(f, "utf8").includes("EXPO_PUBLIC_PROCESSOR_"));
  assert.deepEqual(users, [join("src", "services", "processors.ts")]);
  const body = readFileSync(users[0], "utf8").split("export function devLanConfig")[1].split("\n}\n")[0];
  const guard = body.indexOf("!__DEV__) return null");
  assert.ok(guard > 0 && guard < body.indexOf("EXPO_PUBLIC_PROCESSOR_URL"), "guard precedes env access");
  assert.equal(readFileSync(users[0], "utf8").split("EXPO_PUBLIC_PROCESSOR_").length - 1, 2);
});
