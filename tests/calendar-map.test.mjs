import test from "node:test";
import assert from "node:assert/strict";
const { freeSlots, watchOuts, placeInGap, awayDays, dayIsFull, eventsOn, weekDays } = await import("../src/calendar.ts");
const { areaFor, attachItems, placePlan, matchEvents, dateFromWords, plusWorkingDays, isProject } = await import("../src/map.ts");

const now = new Date("2026-09-21T08:00:00"); // Monday
const at = (n, h = 0, m = 0) => new Date(2026, 8, 21 + n, h, m).toISOString();
const ev = (id, title, n, h, len = 60, allDay = false) => ({ id, calendarId: "c", title, start: allDay ? at(n) : at(n, h), end: allDay ? at(n + 1) : new Date(new Date(at(n, h)).getTime() + len * 60000).toISOString(), allDay });
const week = [ev("sync", "Team sync", 0, 15, 45), ev("court", "Court hearing", 1, 10, 90), ev("dinner", "Dinner with Sam", 1, 19, 120), ev("dentist", "Dentist", 2, 9), ev("nyc", "Flight to NYC", 3, 0, 0, true), ev("client", "Client workshop", 3, 11, 180), ev("back", "Flight back", 4, 0, 0, true), ev("bday", "Mum's birthday", 5, 0, 0, true)];

test("the week is read as days, gaps and full days", () => {
  assert.equal(weekDays(now)[0], "2026-09-21");
  assert.deepEqual(eventsOn(week, "2026-09-22").map((e) => e.id), ["court", "dinner"]);
  const gaps = freeSlots(week, "2026-09-22", now);
  assert.equal(gaps[0].start, at(1, 9), "9 to 10 is free");
  assert.equal(gaps[1].start, at(1, 11, 30), "then after court");
  assert.equal(dayIsFull(week, "2026-09-24"), true, "a flight day is full");
  assert.deepEqual([...awayDays(week)], ["2026-09-24", "2026-09-25"]);
});

test("watch-outs come from the calendar alone: the court date, the trip, the birthday with nothing planned", () => {
  const w = watchOuts(week, now);
  assert.ok(w.some((x) => x.kind === "important" && /court/i.test(x.title) && x.note === "tomorrow 10am · hour kept clear before"));
  assert.ok(w.some((x) => x.kind === "trip" && x.date === "2026-09-24"));
  assert.ok(w.some((x) => x.kind === "occasion" && /birthday/i.test(x.title)));
  assert.ok(!w.some((x) => /dinner/i.test(x.title)), "dinner is not a watch-out");
});

test("placing dodges the hour before court, full days and trips; chases land after the trip", () => {
  const slot = placeInGap(week, "2026-09-22", 20, now, awayDays(week));
  assert.equal(slot.start, at(1, 11, 30), "not at 9 (the hour before court), after it");
  const thu = placeInGap(week, "2026-09-24", 20, now, awayDays(week));
  assert.equal(thu.date, "2026-09-28", "Thursday and Friday are the trip, the weekend is theirs: Monday");
  const items = attachItems([
    { title: "Call the DUI lawyer", kind: "action", project: "DUI case", when: "this Monday", evidence: "a" },
    { title: "Follow up both lawyers", kind: "action", project: "DUI case", when: "tomorrow", evidence: "b" },
    { title: "Lawyer's follow-up", kind: "waiting", project: "DUI case", person: "the lawyer", evidence: "c" },
    { title: "Medical exams", kind: "later", project: "Green card", evidence: "d" },
    { title: "Dentist", kind: "appointment", project: "", when: "Wednesday 9am", evidence: "e" },
  ], []);
  const placed = placePlan(items, week, now);
  assert.equal(placed[0].date, "2026-09-21");
  assert.equal(placed[1].slot.start, at(1, 11, 30));
  assert.equal(placed[2].chaseDate, "2026-09-28", "three working days out would be the NYC Thursday; the next open working day is Monday");
  assert.equal(placed[3].date, undefined);
  assert.equal(placed[4].slot.start, at(2, 9), "an appointment keeps its own time");
  assert.deepEqual(placed.map((p) => p.item.area), ["Legal & admin", "Legal & admin", "Legal & admin", "Health", "Health"]);
});

test("areas, dates and projects: the map's matching is code", () => {
  assert.equal(areaFor("my manager wants a demo Friday"), "Work");
  assert.equal(areaFor("the landlord and the lease renewal"), "Legal & admin");
  assert.equal(areaFor("sort mum's birthday dinner"), "Family & friends");
  assert.deepEqual(dateFromWords("tomorrow", now), { date: "2026-09-22", time: "09:00" });
  assert.equal(dateFromWords("end of month", now).date, "2026-09-30");
  assert.equal(dateFromWords("Nov 3", now).date, "2026-11-03");
  assert.equal(dateFromWords("10am Tuesday", now).time, "10:00");
  assert.equal(dateFromWords("no idea", now), undefined);
  assert.equal(plusWorkingDays("2026-09-25", 3), "2026-09-30");
  const projects = [{ id: "dui", title: "DUI case", area: "Legal & admin", people: ["the lawyer"], words: "talk to the lawyer about the DUI case and the ARD" }, { id: "app", title: "App portfolio", area: "Work", people: ["Ali"], words: "build apps for people" }];
  const attached = attachItems([
    { title: "Send the court letter", kind: "action", project: "", person: "the lawyer", evidence: "send the lawyer the court letter" },
    { title: "Message Ali", kind: "action", project: "App portfolio", evidence: "message Ali about the app" },
    { title: "Book the dentist", kind: "action", project: "", evidence: "book the dentist for the kids" },
  ], projects);
  assert.deepEqual(attached.map((a) => a.projectId), ["dui", "app", undefined]);
  const matched = matchEvents(week, projects);
  assert.deepEqual(matched.get("dui")?.map((e) => e.id), ["court"], "the court hearing belongs to the DUI case");
  assert.equal(isProject([{ title: "x", kind: "action", project: "Call mum", evidence: "" }], "Call mum"), false);
});

test("the clock the person said is kept when free; 'by Friday' is a deadline with the move in the first gap", () => {
  const items = attachItems([
    { title: "Call the DUI lawyer", kind: "action", project: "DUI case", when: "today at 10am", evidence: "a" },
    { title: "Compare two insurance quotes", kind: "action", project: "", when: "this evening", evidence: "b" },
    { title: "Follow up both lawyers", kind: "action", project: "DUI case", when: "by Friday", evidence: "c" },
    { title: "Message Ali", kind: "action", project: "", when: "tomorrow 2pm", evidence: "d" },
  ], []);
  const placed = placePlan(items, week, new Date(2026, 8, 21, 8, 0));
  assert.equal(placed[0].slot.start, at(0, 10), "10am on Monday is free: kept");
  assert.equal(placed[1].slot.start, at(0, 19), "this evening → 19:00 today");
  assert.equal(placed[2].deadline, "2026-09-25");
  assert.equal(placed[2].date, "2026-09-21", "done in the first gap, not on Friday");
  assert.equal(placed[3].slot.start, at(1, 14), "tomorrow 2pm");
});

test("an evening move whose time is taken stays in the evening", () => {
  const dinner = { id: "dinner", calendarId: "c", title: "Dinner with Sam", start: at(0, 19), end: at(0, 20, 30), allDay: false };
  const items = attachItems([{ title: "Compare two insurance quotes", kind: "action", project: "", when: "this evening", evidence: "b" }], []);
  const placed = placePlan(items, [...week, dinner], new Date(2026, 8, 21, 8, 0));
  assert.equal(placed[0].slot.start, at(0, 20, 30), "after dinner, same evening");
  assert.equal(placed[0].note, "19:00 is taken");
});
