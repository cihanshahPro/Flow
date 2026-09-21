import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
const { parsePlan } = await import("../src/ai-policy.ts");
const { attachItems, placePlan } = await import("../src/map.ts");
const { awayDays, dayIsFull } = await import("../src/calendar.ts");
const { localPlan } = await import("../src/intake.ts");

/**
 * Every real intake the dev server kept (scripts/pull-fixtures.sh) is replayed
 * here: the model's items are grounded, attached and placed again, and the
 * invariants that make the plan trustworthy are checked. No expectations are
 * hand-written per fixture; a new dump is covered the moment it is pulled.
 */
const dir = new URL("./fixtures/intakes/", import.meta.url);
let files = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith("-plan.json"));
} catch {
  files = [];
}

const parseCalendar = (context) => {
  // "Mon 22: Team sync 3pm; Court hearing 10am" → all-day-less events on that day; enough to test dodging.
  const events = [];
  for (const line of (context ?? "").split("\n")) {
    const m = line.match(/^(\w{3}) (\d{1,2}): (.+)$/);
    if (!m) continue;
    for (const part of m[3].split("; ")) {
      const t = part.match(/^(.*?)(?: (\d{1,2})(?::(\d{2}))?(am|pm))?$/);
      if (!t) continue;
      const day = new Date(2026, 8, Number(m[2]));
      const h = t[2] ? (Number(t[2]) % 12) + (t[4] === "pm" ? 12 : 0) : 0;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Number(t[3] ?? 0));
      events.push({ id: `${m[2]}-${t[1]}`, calendarId: "c", title: t[1], start: start.toISOString(), end: new Date(start.getTime() + (t[2] ? 3600000 : 864e5)).toISOString(), allDay: !t[2] });
    }
  }
  return events;
};

for (const file of files) {
  test(`replay ${file}`, () => {
    const f = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const now = new Date(f.at);
    const grounded = parsePlan(f.plan, f.text);
    const items = grounded.items.length ? grounded.items : localPlan(f.text, now);
    assert.ok(items.length >= 1, "a dump yields at least one item");
    for (const i of items) assert.ok(f.text.toLowerCase().replace(/\s+/g, " ").includes(i.evidence.toLowerCase()), `evidence in the text: ${i.evidence}`);
    const events = parseCalendar(f.context);
    const away = awayDays(events);
    const placed = placePlan(attachItems(items, []), events, now);
    for (const p of placed) {
      if (p.slot) {
        assert.ok(!away.has(p.slot.date), `${p.item.title}: never on a day away`);
        assert.ok(!dayIsFull(events, p.slot.date), `${p.item.title}: never on a full day`);
        const h = new Date(p.slot.start).getHours();
        assert.ok(h >= 9 && h < 18, `${p.item.title}: inside working hours`);
        for (const e of events) if (!e.allDay) assert.ok(p.slot.end <= e.start || p.slot.start >= e.end, `${p.item.title}: no overlap with ${e.title}`);
      }
      if (p.chaseDate) assert.ok(!away.has(p.chaseDate), `${p.item.title}: chase not while away`);
      if (p.item.kind === "later") assert.equal(p.slot, undefined, `${p.item.title}: later stays off the calendar`);
    }
  });
}

test("the owner's transcript replays through the local floor without a model", () => {
  const text = readFileSync(new URL("./fixtures/owner-dump-1.txt", import.meta.url), "utf8").trim();
  const items = localPlan(text, new Date("2026-09-21T08:00:00"));
  assert.deepEqual(items.map((i) => i.title), ["My DEY case", "The defense lawyer", "An app portfolio", "Amazon FPA"]);
  assert.ok(items.every((i) => ["action", "waiting", "later"].includes(i.kind)));
  assert.ok(items.some((i) => i.kind === "waiting"), "'supposed to give me' is a waiting-for");
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  assert.ok(items.every((i) => norm(text).includes(norm(i.evidence))), "evidence is their words, re-punctuated at signposts");
});
