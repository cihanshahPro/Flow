import { starterFor } from "../starters";
import { profileCompletion } from "../profile-completion";
import React, { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  areaSelections,
  toggleArea,
  productivityGuide,
  obstaclePlan,
  AREAS,
  ITEMS,
  scoreAnswers,
  suggestedPresentation,
  type Profile,
} from "../personality";
const ratings = [
  "Very inaccurate",
  "Moderately inaccurate",
  "Neither accurate nor inaccurate",
  "Moderately accurate",
  "Very accurate",
];
export default function Onboarding({
  profile,
  onSave,
  onClose,
  onCapture,
  onStart,
  onContinue,
  existingWork = false,
  externalBusy = false,
  externalError = "",
  sectionMode,
}: {
  profile: Profile;
  onSave: (p: Profile) => Promise<void>;
  onClose: () => void;
  onCapture: (topic: string) => void;
  onStart: (topic: string) => void;
  onContinue: () => void;
  existingWork?: boolean;
  externalBusy?: boolean;
  externalError?: string;
  sectionMode?: "assessment" | "areas";
}) {
  const [index, setIndex] = useState(() => {
    const first = Array.from({ length: 20 }, (_, i) => i).find(
      (i) =>
        !Number.isInteger(profile.answers[i]) ||
        profile.answers[i] < 1 ||
        profile.answers[i] > 5,
    );
    return first ?? (sectionMode === "assessment" ? 0 : 19);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [details, setDetails] = useState(false);
  const [alternatives, setAlternatives] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const guide = productivityGuide(profile.answers, profile.presentation);
  async function save(p: Profile, after?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(p);
      after?.();
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const button = (label: string, fn: () => void, primary = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || externalBusy}
      onPress={fn}
      style={[s.button, primary && s.primary, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
  const area = AREAS[Math.min(profile.areaIndex, AREAS.length - 1)];
  function advanceArea(status?: string) {
    const updated = {
      ...profile,
      areas: status ? { ...profile.areas, [area.id]: status } : profile.areas,
    };
    if (sectionMode === "areas") {
      const remaining = AREAS.findIndex(
        (a, i) =>
          i > profile.areaIndex &&
          (updated.areas[a.id] === "Later" ||
            !(
              updated.areas[a.id] === "Nothing current" ||
              areaSelections(updated.areas[a.id]).some((c) =>
                a.choices.includes(c),
              )
            )),
      );
      void save(
        {
          ...updated,
          areaIndex: remaining < 0 ? profile.areaIndex : remaining,
          stage: remaining < 0 ? "map" : "areas",
        },
        remaining < 0 ? onClose : undefined,
      );
      return;
    }
    const next = profile.areaIndex + 1;
    void save({
      ...updated,
      areaIndex: Math.min(next, 5),
      stage: next === 6 ? "map" : "areas",
    });
  }

  const active = AREAS.flatMap((a) =>
    areaSelections(profile.areas[a.id]).map((choice) => ({
      title: choice,
      topic: `${a.title}: ${choice}`,
      direction: { directionId: `${a.id}:${choice}`, areaId: a.id, choice },
    })),
  );
  const focus = active.find((x) => x.topic === profile.focus) ?? active[0];
  const completion = profileCompletion(profile);
  function nextPreference(p: Profile): Profile["stage"] {
    if (!p.presentation) return "preferences";
    if (!p.preferredMinutes) return "capacity";
    return "guide";
  }
  function confirmDirection() {
    const confirmed = {
      ...profile,
      focus: focus?.topic,
      focusExplicit: !!focus,
      focusNone: !focus,
      obstacle: undefined,
    };
    void save({ ...confirmed, stage: nextPreference(confirmed) });
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.top}>
        <Text style={s.kicker}>FLOW · YOUR STARTING POINT</Text>
        {button("Close", onClose)}
      </View>
      {profile.stage === "intro" && (
        <>
          <Text style={s.title}>A little understanding. A lighter day.</Text>
          <Text style={s.body}>
            Start with the real, 20-question Mini-IPIP personality assessment.
            Tap how accurately each statement describes you generally—not just
            today.
          </Text>
          <Text style={s.body}>
            Then we’ll make a first map of your life, one area at a time. Your
            progress stays on this device.
          </Text>
          {button(
            "Get to know me",
            () => void save({ ...profile, stage: "assessment" }),
            true,
          )}
          {button(
            "Skip assessment",
            () => void save({ ...profile, stage: "areas" }),
          )}
          <Text style={s.small}>
            Public-domain IPIP assessment, Donnellan et al. (2006). A reflection
            tool, not a diagnosis or a fixed personality type.
          </Text>
        </>
      )}
      {profile.stage === "assessment" && (
        <>
          {sectionMode && (
            <Text style={s.small}>
              Finish this section, then return to your profile.
            </Text>
          )}
          <Text style={s.kicker}>QUESTION {index + 1} OF 20</Text>
          <View style={s.track}>
            <View style={[s.progress, { width: `${(index + 1) * 5}%` }]} />
          </View>
          <Text style={s.title}>{ITEMS[index].text}</Text>
          <Text style={s.body}>How accurately does this describe you?</Text>
          {ratings.map((r, i) =>
            button(
              `${profile.answers[index] === i + 1 ? "✓ " : ""}${r}`,
              () => {
                const answers = [...profile.answers];
                answers[index] = i + 1;
                void save(
                  {
                    ...profile,
                    answers,
                    stage: index === 19 ? "results" : "assessment",
                  },
                  () => {
                    if (index === 19 && sectionMode === "assessment") {
                      onClose();
                    } else setIndex(Math.min(index + 1, 19));
                  },
                );
              },
            ),
          )}
          {index > 0 && button("Previous question", () => setIndex(index - 1))}
          <Text style={s.small}>
            One tap saves your answer. You can pause and return.
          </Text>
        </>
      )}
      {profile.stage === "results" && (
        <>
          <Text style={s.kicker}>YOUR PERSONALITY, IN PLAIN WORDS</Text>
          <Text style={s.title}>{guide.title}</Text>
          <Text style={s.body}>{guide.reason}</Text>
          <View style={s.card}>
            <Text style={s.buttonText}>Your recommended starting routine</Text>
            <Text style={s.body}>
              1. Collect what matters across your life.
            </Text>
            <Text style={s.body}>
              2. Review a suggested first step or use a saved thought.
            </Text>
            <Text style={s.body}>
              3.{" "}
              {guide.presentation === "small"
                ? "Choose a five-minute first action."
                : "Follow the first step in the sequence."}
            </Text>
          </View>
          {details &&
            guide.traits.map((t) => (
              <View key={t.trait} style={s.card}>
                <Text style={s.buttonText}>
                  {t.trait === "Neuroticism" ? "Emotional stability" : t.trait}
                </Text>
                <Text style={s.body}>{t.description}</Text>
              </View>
            ))}
          {button(
            "Use my recommended path",
            () =>
              void save({
                ...profile,
                presentation: guide.presentation,
                stage: Object.keys(profile.areas).length ? "map" : "areas",
              }),
            true,
          )}
          {button(
            guide.presentation === "small"
              ? "I prefer a visible step sequence"
              : "I prefer a smaller first action",
            () =>
              void save({
                ...profile,
                presentation:
                  guide.presentation === "small" ? "sequence" : "small",
                stage: Object.keys(profile.areas).length ? "map" : "areas",
              }),
          )}
          {button(
            details ? "Hide how this works" : "Why this recommendation?",
            () => setDetails(!details),
          )}
          {details && (
            <View style={s.card}>
              {guide.tips.map((t) => (
                <Text key={t} style={s.body}>
                  {t}
                </Text>
              ))}
              <Text style={s.small}>
                Your Mini-IPIP answers describe five traits, not a fixed type.
                Flow’s routine is a starting recommendation to try, not a proven
                best method for your personality. Interpretations use response
                ranges, not population percentiles. You can change the route.
              </Text>
            </View>
          )}
        </>
      )}
      {profile.stage === "areas" && (
        <>
          <Text style={s.kicker}>LIFE AREA {profile.areaIndex + 1} OF 6</Text>
          <Text style={s.title}>{area.title}</Text>
          <Text style={s.body}>{area.prompt}</Text>
          <Text style={s.small}>
            Select everything that applies. We’ll focus on one afterward.
          </Text>
          {area.choices.map((c) => {
            const checked = areaSelections(profile.areas[area.id]).includes(c);
            return (
              <Pressable
                key={c}
                accessibilityRole="checkbox"
                accessibilityLabel={c}
                accessibilityState={{ checked }}
                disabled={busy || externalBusy}
                onPress={() => void save(toggleArea(profile, area.id, c))}
                style={[s.button, checked && s.primary]}
              >
                <Text style={[s.buttonText, checked && { color: "white" }]}>
                  {checked ? "✓ " : "＋ "}
                  {c}
                </Text>
              </Pressable>
            );
          })}
          {areaSelections(profile.areas[area.id]).length > 0 &&
            button(
              `Continue with ${areaSelections(profile.areas[area.id]).length} selected`,
              () => advanceArea(),
              true,
            )}
          {button("Nothing current", () => advanceArea("Nothing current"))}
          {button("Later", () => advanceArea("Later"))}
          {profile.areaIndex > 0 &&
            button(
              "Previous area",
              () => void save({ ...profile, areaIndex: profile.areaIndex - 1 }),
            )}
          <Text style={s.small}>
            A first pass inspired by GTD’s incompletion trigger list. We’ll
            gather the details in your own words next.
          </Text>
        </>
      )}
      {profile.stage === "map" && (
        <>
          <Text style={s.title}>Everything saved. One place to start.</Text>
          <Text style={s.body}>
            {active.length} directions captured.{" "}
            {focus
              ? "We’ll start with the first direction you selected. This is a starting suggestion, not an urgency ranking."
              : "You can return to add directions whenever something comes up."}
          </Text>
          {focus && (
            <View style={s.card}>
              <Text style={s.kicker}>START HERE</Text>
              <Text style={s.title}>{focus.title}</Text>
              <Text style={s.body}>{guide.reason}</Text>
              {button("Walk me through this", confirmDirection, true)}
              {active.length > 1 &&
                button(
                  alternatives
                    ? "Hide other starting points"
                    : "Choose a different starting point",
                  () => setAlternatives(!alternatives),
                )}
              {alternatives &&
                active
                  .filter((x) => x.topic !== focus.topic)
                  .map((x) =>
                    button(
                      x.title,
                      () =>
                        void save(
                          { ...profile, focus: x.topic, focusExplicit: true },
                          () => setAlternatives(false),
                        ),
                    ),
                  )}
            </View>
          )}
          {button(showMap ? "Hide my full map" : "See my full map", () =>
            setShowMap(!showMap),
          )}
          {showMap && (
            <View style={s.card}>
              <Text style={s.kicker}>MY LIFE</Text>
              {AREAS.map((a) => (
                <View key={a.id} style={s.branch}>
                  <Text style={s.buttonText}>↳ {a.title}</Text>
                  {areaSelections(profile.areas[a.id]).length ? (
                    areaSelections(profile.areas[a.id]).map((c) => (
                      <Text key={c} style={s.body}>
                        • {c}
                      </Text>
                    ))
                  ) : (
                    <Text style={s.small}>
                      {typeof profile.areas[a.id] === "string"
                        ? profile.areas[a.id]
                        : "Not explored"}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
          {!focus && button("Confirm no current focus", confirmDirection, true)}
          {button(
            "Review life areas",
            () => void save({ ...profile, stage: "areas", areaIndex: 0 }),
          )}
          {profile.answers.length === 20 &&
            button(
              "Review my profile",
              () => void save({ ...profile, stage: "results" }),
            )}
          {button(
            "Retake assessment",
            () =>
              void save(
                {
                  ...profile,
                  answers: [],
                  stage: "assessment",
                },
                () => setIndex(0),
              ),
          )}
          {button(
            "Remove personality answers",
            () => void save({ ...profile, answers: [] }),
          )}
        </>
      )}
      {profile.stage === "preferences" && (
        <>
          <Text style={s.kicker}>HOW FLOW GUIDES YOU</Text>
          <Text style={s.title}>A pace that feels manageable.</Text>
          <Text style={s.body}>
            Choose how you want to see your next steps. You can change this in
            Profile.
          </Text>
          {(["small", "sequence"] as const).map((presentation) =>
            button(
              presentation === "small"
                ? "One small action at a time"
                : "Show me a step sequence",
              () => {
                const updated = { ...profile, presentation };
                void save({ ...updated, stage: nextPreference(updated) });
              },
              presentation === guide.presentation,
            ),
          )}
        </>
      )}
      {profile.stage === "capacity" && (
        <>
          <Text style={s.kicker}>ONE LAST PREFERENCE</Text>
          <Text style={s.title}>How much time usually fits?</Text>
          <Text style={s.body}>
            We’ll use this to keep Today’s suggestions manageable. You can
            change it any day.
          </Text>
          {([10, 30, 60, "varies"] as const).map((preferredMinutes) =>
            button(
              preferredMinutes === "varies"
                ? "It varies — I’ll choose each day"
                : `${preferredMinutes} minutes`,
              () => void save({ ...profile, preferredMinutes, stage: "guide" }),
            ),
          )}
        </>
      )}
      {profile.stage === "guide" && (
        <View style={s.card}>
          <Text style={s.kicker}>{completion.percent}% PROFILE COMPLETE</Text>
          <Text style={s.body}>
            {completion.percent === 100
              ? "Your starting profile is ready. Each action you finish builds your accomplishment progress."
              : "You can start now. Profile will guide you through the remaining pieces; levels unlock at 100%."}
          </Text>
        </View>
      )}
      {profile.stage === "guide" && !focus && (
        <>
          <Text style={s.title}>
            {existingWork
              ? "Pick up where you left off."
              : "Room for whatever comes next."}
          </Text>
          <Text style={s.body}>
            {existingWork
              ? "Your saved work is ready to continue."
              : "You haven’t chosen a direction yet. Your profile is saved; you can finish setup or capture a thought from Today."}
          </Text>
          {button(
            existingWork ? "Continue my saved work" : "Go to Today",
            () => void save({ ...profile, completed: true }, onContinue),
            true,
          )}
        </>
      )}
      {profile.stage === "guide" && focus && (
        <>
          <Text style={s.kicker}>
            YOUR FIRST ACTION · {focus.title.toUpperCase()}
          </Text>
          {existingWork ? (
            <>
              <Text style={s.title}>Pick up where you left off.</Text>
              <Text style={s.body}>
                You already have saved work. We’ll continue that before asking
                for more.
              </Text>
              {button(
                "Continue my saved work",
                () => void save({ ...profile, completed: true }, onContinue),
                true,
              )}
            </>
          ) : (
            <>
              <Text style={s.title}>{starterFor(focus.direction).title}</Text>
              <Text style={s.body}>{starterFor(focus.direction).why}</Text>
              <Text style={s.small}>
                Suggested from the interest you selected. Accept it only if it
                fits; your existing details can replace it.
              </Text>
              {button("Use this first step", () => onStart(focus.topic), true)}
              {button("Use my own details instead", () =>
                onCapture(focus.topic),
              )}
            </>
          )}
          {button(
            "Back to my starting point",
            () => void save({ ...profile, stage: "map" }),
          )}
        </>
      )}
      {!!externalError && (
        <Text accessibilityRole="alert" style={s.error}>
          {externalError}
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 24,
    paddingTop: 32,
    gap: 16,
    paddingBottom: 60,
    backgroundColor: "#F7F8FA",
    flexGrow: 1,
  },
  top: { gap: 8 },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#54647B",
    fontWeight: "700",
  },
  title: { fontSize: 34, fontWeight: "700", color: "#142138", lineHeight: 41 },
  body: { fontSize: 16, lineHeight: 25, color: "#54647B" },
  small: { fontSize: 13, lineHeight: 20, color: "#64748B" },
  button: {
    padding: 17,
    borderRadius: 18,
    backgroundColor: "#E9EEF7",
    minHeight: 52,
  },
  primary: { backgroundColor: "#345BEE" },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#142138" },
  card: { padding: 18, borderRadius: 22, backgroundColor: "#FFFFFF", gap: 12 },
  branch: {
    borderLeftWidth: 2,
    borderLeftColor: "#BBCBF5",
    paddingLeft: 16,
    gap: 9,
    paddingVertical: 9,
  },
  track: { height: 5, backgroundColor: "#E2E7EF", borderRadius: 5 },
  progress: { height: 5, backgroundColor: "#345BEE" },
  error: { color: "#A12B32" },
});
