import test from "node:test";
import assert from "node:assert/strict";
import { threadGroup, threadLine } from "../src/thread.ts";
import { suggestDraft } from "../src/drafts.ts";

const base = () => suggestDraft("t1", "I need to finish the quarterly report for my boss by Friday.", new Date("2026-09-19T10:00:00.000Z"));
const task = (over) => ({ id: "flow:t1:s1", title: "I will draft page 1 tonight", done: false, plannedDate: "2026-09-19", waitingOn: "", chaseDate: "", ...over });
const now = new Date(2026, 8, 19, 9);

test("groups: active by default, waiting when parked or waiting on someone, done when resolved", () => {
  const t = base();
  assert.equal(threadGroup(t, []), "active");
  assert.equal(threadGroup({ ...t, state: "parked" }, []), "waiting");
  assert.equal(threadGroup(t, [task({ waitingOn: "Ali" })]), "waiting");
  assert.equal(threadGroup({ ...t, resolvedAt: "2026-09-19T00:00:00.000Z" }, []), "done");
});

test("line shows the next move or who it waits on", () => {
  const t = base();
  assert.equal(threadLine(t, [task()], now), "Next: Draft page 1");
  assert.equal(threadLine(t, [task({ waitingOn: "Ali", chaseDate: "2026-09-22" })], now), "Waiting on Ali · check 2026-09-22");
});
