import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectShaper, quotaRemaining, consumeQuota, exhaustQuota, parseQuotaLimit, monthKey,
  parseShape, cloudRequest, readCloudResponse, CloudError, profileContext, contextText,
} from "../src/ai-policy.ts";

const noLlm = { speech: true, llm: false, reason: "device-not-eligible" };
const base = { caps: noLlm, consent: "allowed", quotaRemaining: 5, cloudConfigured: true };

test("selector: Apple Intelligence available → on-device, whatever consent or quota", () => {
  const s = selectShaper({ ...base, caps: { ...noLlm, llm: true, reason: "available" }, consent: "declined", quotaRemaining: 0 });
  assert.equal(s.kind, "on-device");
});
test("selector: no on-device AI, consent given, quota left → cloud", () => {
  const s = selectShaper(base);
  assert.equal(s.kind, "cloud");
  assert.equal(s.askConsent, undefined);
  assert.match(s.reason, /device-not-eligible/);
});
test("selector: no on-device AI and never asked → cloud after one-time consent", () => {
  const s = selectShaper({ ...base, consent: undefined });
  assert.equal(s.kind, "cloud");
  assert.equal(s.askConsent, true);
});
test("selector: declined, quota spent or no cloud → template", () => {
  assert.deepEqual(selectShaper({ ...base, consent: "declined" }), { kind: "template", reason: "cloud-consent-declined" });
  assert.equal(selectShaper({ ...base, quotaRemaining: 0 }).reason, "cloud-quota-exhausted");
  assert.equal(selectShaper({ ...base, consent: undefined, quotaRemaining: 0 }).askConsent, undefined, "no consent sheet when nothing is left");
  assert.equal(selectShaper({ ...base, cloudConfigured: false }).kind, "template");
});
test("selector: dev LAN only replaces cloud when on-device AI is missing", () => {
  assert.equal(selectShaper({ ...base, devLan: true }).kind, "dev-lan");
  assert.equal(selectShaper({ ...base, devLan: true, caps: { ...noLlm, llm: true } }).kind, "on-device");
});

test("quota: default 20 per month, counts up, resets next month", () => {
  const sept = new Date(2026, 8, 19), oct = new Date(2026, 9, 1);
  assert.equal(parseQuotaLimit(undefined), 20);
  assert.equal(parseQuotaLimit("5"), 5);
  assert.equal(parseQuotaLimit("-1"), 20);
  assert.equal(parseQuotaLimit("abc"), 20);
  let q;
  for (let i = 0; i < 20; i++) q = consumeQuota(q, sept);
  assert.deepEqual(q, { month: "2026-09", used: 20 });
  assert.equal(quotaRemaining(q, sept, 20), 0);
  assert.equal(quotaRemaining(q, oct, 20), 20);
  assert.deepEqual(consumeQuota(q, oct), { month: monthKey(oct), used: 1 });
  assert.equal(quotaRemaining(exhaustQuota(sept, 20), sept, 20), 0);
});

const shape = {
  title: "Website project", summary: "Call Alex", reply: "Alex — got it.", question: "",
  points: [{ id: "people", evidence: "Call Alex" }, { id: "nonsense", evidence: "x" }],
  choices: [{ label: "Contact Alex", action: "Call Alex", smallAction: "Open contact", evidence: "Call Alex", reason: "Named." }],
};
test("schema: native JSON string and server object parse to the same shape; bad ids are dropped", () => {
  const a = parseShape(JSON.stringify(shape)), b = parseShape(shape);
  assert.deepEqual(a, b);
  assert.deepEqual(a.points, [{ id: "people", evidence: "Call Alex" }]);
});
test("schema: rejects missing fields, too many choices and malformed choices", () => {
  assert.throws(() => parseShape("not json"));
  assert.throws(() => parseShape({ ...shape, title: "" }));
  assert.throws(() => parseShape({ ...shape, choices: [1, 2, 3, 4] }));
  assert.throws(() => parseShape({ ...shape, choices: [{ label: "x" }] }));
});

test("cloud contract: request carries text and profile context only", () => {
  const ctx = { type: "Steward", areas: ["Work"] };
  const req = cloudRequest("Call Alex", "en-US", ctx);
  assert.deepEqual(Object.keys(req).sort(), ["locale", "profile", "text", "tier", "version"]);
  assert.equal(req.version, 1);
  assert.ok(!JSON.stringify(req).match(/audio|m4a|file:/));
  assert.throws(() => cloudRequest("  ", "en", null));
  assert.throws(() => cloudRequest("x".repeat(22001), "en", null));
});
test("cloud contract: responses map to shapes or typed errors", () => {
  assert.equal(readCloudResponse(200, { version: 1, shape }).title, "Website project");
  const code = (status, body) => { try { readCloudResponse(status, body); } catch (e) { assert.ok(e instanceof CloudError); return e.code; } };
  assert.equal(code(402, { error: { code: "quota_exceeded", message: "" } }), "quota_exceeded");
  assert.equal(code(429, null), "rate_limited");
  assert.equal(code(500, null), "unavailable");
  assert.equal(code(200, { version: 2, shape }), "bad_response");
  assert.equal(code(200, { version: 1, shape: {} }), "bad_response");
});

test("profile context names the Flow type and plate, never raw quiz answers", () => {
  assert.equal(profileContext(null), null);
  const ctx = profileContext({ version: 1, answers: [1, 2], stage: "guide", areaIndex: 0, areas: {}, plate: { areas: ["Work"], people: ["Partner"], obstacles: ["Energy"], timeWindow: "Evenings" } });
  assert.deepEqual(ctx, { areas: ["Work"], people: ["Partner"], timeWindow: "Evenings", obstacles: ["Energy"] });
  assert.match(contextText({ type: "Architect", typeLine: "Facts first." }), /Working type: Architect/);
});

test("a plan item is dropped when its title is not about the person's words (the model reading the calendar back)", async () => {
  const { parsePlan } = await import("../src/ai-policy.ts");
  const text = "I need to follow up with the traffic court lawyer tomorrow and start the app portfolio.";
  const plan = parsePlan({ items: [
    { title: "Follow up with traffic court lawyer", kind: "action", project: "DUI case", area: "Legal & admin", evidence: "follow up with the traffic court lawyer" },
    { title: "Dinner with Sam", kind: "appointment", project: "", area: "Family & friends", evidence: "start the app portfolio" },
    { title: "Start app portfolio", kind: "action", project: "App portfolio", area: "Work", evidence: "start the app portfolio" },
    { title: "Invented thing", kind: "action", project: "", area: "Other", evidence: "not in the text" },
  ] }, text);
  assert.deepEqual(plan.items.map((i) => i.title), ["Follow up with traffic court lawyer", "Start app portfolio"]);
});
