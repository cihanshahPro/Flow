import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the plan contract is one text in four places: app, worker, dev server, on-device", async () => {
  const { PLAN_INSTRUCTIONS, PLAN_TOOL } = await import("../src/ai-policy.ts");
  const dev = await import("../scripts/plan-contract.mjs");
  assert.equal(dev.PLAN_INSTRUCTIONS, PLAN_INSTRUCTIONS, "regenerate scripts/plan-contract.mjs");
  assert.deepEqual(dev.PLAN_TOOL, PLAN_TOOL);
  const worker = readFileSync(new URL("../server/shape-worker/src/prompt.ts", import.meta.url), "utf8");
  assert.ok(worker.includes(PLAN_INSTRUCTIONS), "server/shape-worker/src/prompt.ts PLAN_INSTRUCTIONS drifted");
  const swift = readFileSync(new URL("../modules/flow-intelligence/ios/FlowIntelligenceModule.swift", import.meta.url), "utf8");
  assert.ok(swift.includes(PLAN_INSTRUCTIONS), "FlowIntelligenceModule.swift planInstructions drifted");
  const shaper = readFileSync(new URL("../scripts/shape-thought.swift", import.meta.url), "utf8");
  assert.ok(shaper.includes(PLAN_INSTRUCTIONS), "scripts/shape-thought.swift planInstructions drifted");
});

test("the chat contract is one text in four places too", async () => {
  const { CHAT_INSTRUCTIONS, CHAT_TOOL } = await import("../src/ai-policy.ts");
  const dev = await import("../scripts/plan-contract.mjs");
  assert.equal(dev.CHAT_INSTRUCTIONS, CHAT_INSTRUCTIONS, "regenerate scripts/plan-contract.mjs");
  assert.deepEqual(dev.CHAT_TOOL, CHAT_TOOL);
  const worker = readFileSync(new URL("../server/shape-worker/src/prompt.ts", import.meta.url), "utf8");
  assert.ok(worker.includes(CHAT_INSTRUCTIONS), "server/shape-worker/src/prompt.ts CHAT_INSTRUCTIONS drifted");
  const swift = readFileSync(new URL("../modules/flow-intelligence/ios/FlowIntelligenceModule.swift", import.meta.url), "utf8");
  assert.ok(swift.includes(CHAT_INSTRUCTIONS), "FlowIntelligenceModule.swift chatInstructions drifted");
  const shaper = readFileSync(new URL("../scripts/shape-thought.swift", import.meta.url), "utf8");
  assert.ok(shaper.includes(CHAT_INSTRUCTIONS), "scripts/shape-thought.swift chatInstructions drifted");
});
