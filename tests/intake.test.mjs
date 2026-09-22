import test from "node:test";
import assert from "node:assert/strict";
const { segmentDump, subjectsOf, subjectTitle } = await import("../src/intake.ts");

const dump =
  "Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday. The landlord wants an answer on the lease by the end of the month. My sister wants me to sort mum's birthday dinner next Saturday. The gym renews next week and I haven't been in months. And I need to renew my passport before Lisbon in November.";

test("a two-minute dump is cut into one subject per thing, in order, each with its own sentences", () => {
  const subjects = segmentDump(dump);
  assert.deepEqual(subjects.map((s) => s.title), ["Work project", "An answer on the lease", "Sort mum's birthday dinner next Saturday", "The gym renews next week", "Renew my passport"]);
  assert.match(subjects[1].evidence, /^The landlord wants/);
  assert.match(subjects[4].evidence, /Lisbon in November/);
});

test("filler is dropped, sequence sentences ride along, and a short dump stays one subject", () => {
  const spoken = "So um there's a lot going on. The demo for my manager is on Friday and the designer keeps going quiet, three of five screens are done. Then there's the dentist for the kids, my wife keeps asking. Oh and I still haven't called my mum back, it's been two weeks.";
  assert.deepEqual(segmentDump(spoken).map((s) => s.title), ["The demo for my manager", "The dentist for the kids", "Called my mum back"]);
  assert.deepEqual(segmentDump("So many things going on. Work project is behind because the designer keeps missing deadlines. Also my landlord is asking about the lease renewal by end of month and I have not decided if we stay. Also I have not called my mum back in two weeks.").map((s) => s.title), ["Work project", "The lease renewal", "Called my mum back in two weeks"]);
  assert.equal(segmentDump("Thinking about the garage situation and how messy it has gotten. The car does not fit any more and winter is coming.").length, 1);
  const tax = segmentDump("I need to finish the tax filing with my accountant before Friday because the deadline is strict, otherwise there is a penalty. First I have to collect the receipts, then tonight I'll email her.");
  assert.equal(tax.length, 1);
  assert.equal(tax[0].title, "Finish the tax filing with my accountant");
});

test("titles name the thing, not the person asking", () => {
  assert.equal(subjectTitle("My sister wants me to sort mum's birthday dinner next Saturday."), "Sort mum's birthday dinner next Saturday");
  assert.equal(subjectTitle("Also the car insurance renewal is due at the end of the month."), "The car insurance renewal");
  assert.equal(subjectTitle("I'm also behind on the tax filing with my accountant, the deadline is strict."), "The tax filing with my accountant");
});

test("the model's titles win where it listed the same subject; its extra grounded subjects are added, ungrounded ones ignored", () => {
  const listed = [
    { title: "Demo for Friday", evidence: "manager wants a demo Friday" },
    { title: "Lease renewal", evidence: "answer on the lease" },
    { title: "Invented thing", evidence: "not in the text at all" },
  ];
  const subjects = subjectsOf(dump, listed);
  assert.deepEqual(subjects.map((s) => s.title), ["Demo for Friday", "Lease renewal", "Sort mum's birthday dinner next Saturday", "The gym renews next week", "Renew my passport"]);
  assert.match(subjects[0].evidence, /^Work project is behind/, "the local sentence is the evidence, not the model's quote");
  const extra = subjectsOf("The demo for my manager is on Friday. The designer keeps going quiet. Three of five screens are done. My knee has been hurting since the run.", [{ title: "Knee pain", evidence: "knee has been hurting" }]);
  assert.ok(extra.some((s) => s.title === "Knee pain"));
});

test("a two-minute spoken dump (sample fixture, invented person) comes out as its four things", async () => {
  const fs = await import("node:fs");
  const dump = fs.readFileSync(new URL("./fixtures/sample-dump-1.txt", import.meta.url), "utf8").trim();
  const subjects = segmentDump(dump);
  assert.deepEqual(subjects.map((s) => s.title), ["My tenancy case", "The building surveyor", "A photo portfolio", "An Etsy shop"]);
  assert.match(subjects[0].evidence, /^Starting with having to do a few things/, "the intro rides with the first item");
  assert.match(subjects[1].evidence, /housing adviser as well/);
  assert.match(subjects[1].evidence, /flat measurements/);
  assert.match(subjects[2].evidence, /free shoot for him/, "'one of the things' continues the app subject");
  assert.doesNotMatch(subjects.map((s) => s.title).join(), /stuff on my mind|Starting with/);
  // The on-device model's shorter list names two of them; the local pass keeps the other two.
  const merged = subjectsOf(dump, [{ title: "Housing Follow-ups", evidence: "reach out to it" }, { title: "Portfolio Website", evidence: "shoot events for people" }]);
  assert.deepEqual(merged.map((s) => s.title), ["Housing Follow-ups", "The building surveyor", "Portfolio Website", "An Etsy shop"]);
});
