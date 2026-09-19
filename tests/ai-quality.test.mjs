import test from "node:test";
import assert from "node:assert/strict";
const q = await import("../src/ai-quality.ts");
const { shapedDraft } = await import("../src/drafts.ts");
const { needsFunnel, assessmentDone, shouldInviteAssessment, newProfile, ITEMS, FUNNEL_VERSION, INVITE_SNOOZE_MS } = await import("../src/personality.ts");
const { moveHeadline } = await import("../src/thread.ts");

test("labels must be concrete: 2–6 words and no skip/none/n/a/other/nothing", () => {
  for (const ok of ["Call the plumber", "Email Alex about pricing", "Book dentist"]) assert.ok(q.isConcreteLabel(ok), ok);
  for (const bad of ["Skip", "Skip this", "None of these", "N/A", "Other", "Do nothing now", "Call", "one two three four five six seven"])
    assert.ok(!q.isConcreteLabel(bad), bad);
  assert.ok(!q.isConcreteAction("Skip it"));
  assert.ok(!q.isConcreteAction("Call"));
  assert.ok(q.isConcreteAction("Call Alex"));
  assert.ok(q.isConcreteLabel("Another option"), "'other' is matched as a word, not a substring");
});

test("a move headline is '<time>: <verb + object>' within 60 characters", () => {
  assert.ok(q.isMoveHeadline("Today: Call Alex about the website"));
  assert.ok(q.isMoveHeadline("Tomorrow: Email the designer"));
  assert.ok(!q.isMoveHeadline("Call Alex"), "no time");
  assert.ok(!q.isMoveHeadline("Today: Call"), "no object");
  assert.ok(!q.isMoveHeadline("Today: Skip it"));
  assert.ok(!q.isMoveHeadline("Today: " + "word ".repeat(15)), "too long");
  const task = { title: "Call Alex about the free portfolio project and the invoices for last spring plus more" };
  assert.ok(q.isMoveHeadline(moveHeadline(task, undefined, new Date("2026-09-19T09:00:00"))), "real headlines pass");
});

test("invalid AI options are dropped; fewer than two left are topped up from the template", () => {
  const source = "I need to call Alex. Then email the designer about the logo.";
  const c = (label, action, evidence) => ({ label, action, smallAction: "Open the contact", reason: "It is next.", evidence });
  const draft = shapedDraft("t", source, {
    title: "Alex and the logo",
    summary: "s",
    choices: [c("Skip", "Skip for now", "call Alex"), c("Call Alex", "Call Alex", "call Alex")],
  });
  assert.ok(draft.steps.length >= 2, "topped up");
  assert.ok(!draft.steps.some((s) => /skip/i.test(s.title + (s.label ?? ""))));
  assert.equal(draft.steps.filter((s) => s.id.startsWith("ai-")).length, 1);
  assert.equal(new Set(draft.steps.map((s) => s.title.toLowerCase())).size, draft.steps.length, "no repeats");
  assert.ok(draft.steps.length <= 3);
  // Good output passes untouched.
  const good = shapedDraft("t", source, {
    title: "x", summary: "s",
    choices: [c("Call Alex", "Call Alex", "call Alex"), c("Email the designer", "Email the designer about the logo", "email the designer about the logo")],
  });
  assert.deepEqual(good.steps.map((s) => s.id), ["ai-0", "ai-1"]);
});

test("raceShape times out, cancels, and passes results through", async () => {
  await assert.rejects(q.raceShape(new Promise(() => {}), 15), q.ShapeTimeout);
  const abort = new AbortController();
  const p = q.raceShape(new Promise(() => {}), 5000, abort.signal);
  abort.abort();
  await assert.rejects(p, q.ShapeCancelled);
  assert.equal(await q.raceShape(Promise.resolve(7), 50), 7);
  await assert.rejects(q.raceShape(Promise.reject(new Error("boom")), 50), /boom/);
  assert.equal(q.SHAPE_TIMEOUT_MS, 30000);
});

test("migration: profiles that finished the test-first funnel keep their flow; new ones do not need the test", () => {
  const finished = { ...newProfile(), answers: ITEMS.map(() => 4), completed: true, funnelVersion: 3 };
  assert.equal(needsFunnel(finished), false, "build-12 users are not sent back through onboarding");
  assert.equal(shouldInviteAssessment(finished, true), false);
  assert.equal(needsFunnel({ ...newProfile() }), true, "nobody yet → welcome + first thought");
  assert.equal(needsFunnel({ ...newProfile(), funnelVersion: FUNNEL_VERSION }), false);
  assert.ok(assessmentDone(finished.answers));
  assert.ok(!assessmentDone([1, 2, 3]));
});

test("the get-to-know-you invitation: after the first thread, quiet after Later, never once the test is done", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const fresh = { ...newProfile(), funnelVersion: FUNNEL_VERSION, completed: true };
  assert.equal(shouldInviteAssessment(fresh, false, now), false, "value first: no invite before the first thread");
  assert.equal(shouldInviteAssessment(fresh, true, now), true);
  const later = { ...fresh, assessmentLaterAt: now.toISOString() };
  assert.equal(shouldInviteAssessment(later, true, new Date(now.getTime() + 60_000)), false);
  assert.equal(shouldInviteAssessment(later, true, new Date(now.getTime() + INVITE_SNOOZE_MS + 1)), true, "asked again later");
  assert.equal(shouldInviteAssessment({ ...fresh, answers: ITEMS.map(() => 3) }, true, now), false);
});
