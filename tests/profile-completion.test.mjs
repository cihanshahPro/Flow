import test from "node:test";
import assert from "node:assert/strict";
import { AREAS, newProfile } from "../src/personality.ts";
import { profileCompletion } from "../src/profile-completion.ts";

const full = (extra = {}) => ({
  ...newProfile(),
  answers: Array(20).fill(3),
  areas: Object.fromEntries(AREAS.map((area) => [area.id, [area.choices[0]]])),
  focus: "Work & making: Build something",
  focusExplicit: true,
  presentation: "small",
  preferredMinutes: 30,
  ...extra,
});
const section = (profile, id) =>
  profileCompletion(profile).sections.find((item) => item.id === id);

test("empty profile starts at zero with one next setup step", () => {
  const result = profileCompletion(newProfile());
  assert.equal(result.version, 1);
  assert.equal(result.percent, 0);
  assert.equal(result.completedCount, 0);
  assert.equal(result.totalCount, 5);
  assert.equal(result.next.id, "assessment");
  assert.deepEqual(
    result.sections.map((item) => item.id),
    ["assessment", "areas", "focus", "guidance", "capacity"],
  );
  assert.ok(result.sections.every((item) => item.why && item.detail));
});

test("all five saved sections reach 100 percent with no next setup step", () => {
  const result = profileCompletion(full());
  assert.equal(result.percent, 100);
  assert.equal(result.completedCount, 5);
  assert.equal(result.next, undefined);
  assert.ok(
    result.sections.every((item) => item.complete && item.fraction === 1),
  );
});

test("partial completion uses equal section weights rather than raw field counts", () => {
  const profile = {
    ...newProfile(),
    answers: Array(10).fill(3),
    areas: {
      work: ["Build something", "Finish a project"],
      home: "Nothing current",
      people: "Follow up",
    },
    presentation: "sequence",
  };
  // Half the assessment (10), half the areas (10), explicit guidance (20).
  assert.equal(profileCompletion(profile).percent, 40);
  assert.equal(profileCompletion(profile).completedCount, 1);
  assert.equal(section(profile, "assessment").fraction, 0.5);
  assert.equal(section(profile, "areas").fraction, 0.5);
});

test("Later, empty selections and unknown values leave an area unfinished", () => {
  const profile = full({
    areas: {
      work: "Later",
      people: ["Later"],
      admin: [],
      home: "",
      health: "Made-up selection",
      dates: ["Unrecognized choice"],
      unknownArea: "Nothing current",
    },
  });
  assert.equal(section(profile, "areas").fraction, 0);
  assert.equal(section(profile, "areas").complete, false);
});

test("Nothing current completes area review without fabricating interests", () => {
  const profile = full({
    areas: Object.fromEntries(
      AREAS.map((area, index) => [
        area.id,
        index % 2 === 0 ? "Nothing current" : ["Nothing current"],
      ]),
    ),
    focus: undefined,
    focusExplicit: undefined,
    focusNone: true,
  });
  assert.equal(section(profile, "areas").complete, true);
  assert.equal(section(profile, "focus").complete, true);
  assert.equal(profileCompletion(profile).percent, 100);
  assert.equal(
    section({ ...profile, focusNone: false }, "focus").complete,
    false,
  );
});

test("focus needs explicit confirmation and must remain a selected direction", () => {
  assert.equal(section(full(), "focus").complete, true);
  for (const extra of [
    { focusExplicit: undefined },
    { focusExplicit: false },
    { focus: "Work & making: Find work or clients" },
    { focus: "Unrecognized area: Build something" },
    { focus: undefined, focusNone: true },
    { areas: {}, focusNone: false },
  ]) {
    assert.equal(section(full(extra), "focus").complete, false);
  }
});

test("legacy string selections receive the same credit as current arrays", () => {
  const legacy = full({
    areas: Object.fromEntries(AREAS.map((area) => [area.id, area.choices[0]])),
  });
  assert.deepEqual(profileCompletion(legacy), profileCompletion(full()));
});

test("invalid or missing preferences cannot count as confirmed defaults", () => {
  for (const presentation of [undefined, null, "auto", "", 0]) {
    assert.equal(section(full({ presentation }), "guidance").complete, false);
  }
  for (const preferredMinutes of [undefined, null, 0, 5, -10, NaN, "30", ""]) {
    assert.equal(
      section(full({ preferredMinutes }), "capacity").complete,
      false,
    );
  }
  for (const presentation of ["small", "sequence"]) {
    assert.equal(section(full({ presentation }), "guidance").complete, true);
  }
  for (const preferredMinutes of [10, 30, 60, "varies"]) {
    assert.equal(
      section(full({ preferredMinutes }), "capacity").complete,
      true,
    );
  }
  const inferred = full({ presentation: undefined, focusExplicit: undefined });
  assert.equal(profileCompletion(inferred).percent, 60);
  assert.equal(profileCompletion(inferred).next.id, "focus");
});

test("assessment counts only valid instrument answers and never scores malformed responses", () => {
  const profile = full({ answers: [1, 2, 0, 6, NaN, 3.5, 5, "4"] });
  assert.equal(section(profile, "assessment").fraction, 3 / 20);
  assert.equal(section(profile, "assessment").complete, false);
  assert.equal(profileCompletion(profile).percent, 83);
  for (const answers of [Array(21).fill(3), Array(19).fill(3), null]) {
    const result = profileCompletion(full({ answers }));
    assert.equal(result.sections[0].complete, false);
    assert.ok(result.percent >= 0 && result.percent < 100);
  }
});

test("profile completion excludes activity levels, tasks and old completed flags", () => {
  const base = newProfile();
  const withActivity = {
    ...base,
    completed: true,
    tasks: [{ done: true }],
    drafts: [{ state: "draft" }],
    level: 4,
  };
  assert.deepEqual(profileCompletion(withActivity), profileCompletion(base));
  const snapshot = JSON.stringify(full());
  const profile = JSON.parse(snapshot);
  profileCompletion(profile);
  assert.equal(JSON.stringify(profile), snapshot);
});
