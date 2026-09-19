import React, { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AREAS,
  ITEMS,
  scoreAnswers,
  suggestedPresentation,
  newProfile,
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
}: {
  profile: Profile;
  onSave: (p: Profile) => Promise<void>;
  onClose: () => void;
  onCapture: (topic: string) => void;
}) {
  const [index, setIndex] = useState(Math.min(profile.answers.length, 19));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
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
      disabled={busy}
      onPress={fn}
      style={[s.button, primary && s.primary, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
  const area = AREAS[Math.min(profile.areaIndex, AREAS.length - 1)];
  function areaAnswer(answer: string) {
    const next = profile.areaIndex + 1;
    void save({
      ...profile,
      areas: { ...profile.areas, [area.id]: answer },
      areaIndex: Math.min(next, 5),
      stage: next === 6 ? "map" : "areas",
    });
  }
  const active = AREAS.filter(
    (a) =>
      profile.areas[a.id] &&
      !["Nothing current", "Later"].includes(profile.areas[a.id]),
  );
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
                  () => setIndex(Math.min(index + 1, 19)),
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
          <Text style={s.title}>Your starting profile.</Text>
          <Text style={s.body}>
            These are averages from 1–5, not percentiles or labels. No single
            score decides what you should do.
          </Text>
          {Object.entries(scoreAnswers(profile.answers)).map(
            ([trait, value]) => (
              <View key={trait} style={s.card}>
                <Text style={s.buttonText}>
                  {trait === "Neuroticism" ? "Emotional stability" : trait} ·{" "}
                  {(trait === "Neuroticism" ? 6 - value : value).toFixed(2)} / 5
                </Text>
              </View>
            ),
          )}
          <Text style={s.body}>
            Flow suggests{" "}
            {suggestedPresentation(profile.answers) === "small"
              ? "a smaller first action"
              : "a visible sequence of steps"}
            . This is a product experiment, not a validated personality
            prescription. Choose what feels useful.
          </Text>
          {button(
            "Start with smaller actions",
            () =>
              void save({ ...profile, presentation: "small", stage: "areas" }),
            suggestedPresentation(profile.answers) === "small",
          )}
          {button(
            "Show me the step sequence",
            () =>
              void save({
                ...profile,
                presentation: "sequence",
                stage: "areas",
              }),
            suggestedPresentation(profile.answers) === "sequence",
          )}
        </>
      )}
      {profile.stage === "areas" && (
        <>
          <Text style={s.kicker}>LIFE AREA {profile.areaIndex + 1} OF 6</Text>
          <Text style={s.title}>{area.title}</Text>
          <Text style={s.body}>{area.prompt}</Text>
          {area.choices.map((c) => button(c, () => areaAnswer(c), true))}
          {button("Nothing current", () => areaAnswer("Nothing current"))}
          {button("Later", () => areaAnswer("Later"))}
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
          <Text style={s.title}>Room for what matters.</Text>
          <Text style={s.body}>
            Your first map—not a list of commitments. Pick one branch to add the
            details by voice.
          </Text>
          <View style={s.card}>
            <Text style={s.kicker}>MY LIFE</Text>
            {AREAS.map((a) => (
              <View key={a.id} style={s.branch}>
                <Text style={s.buttonText}>↳ {a.title}</Text>
                <Text style={s.small}>
                  {profile.areas[a.id] || "Not explored"}
                </Text>
                {active.includes(a) &&
                  button(
                    `Talk about ${profile.areas[a.id].toLowerCase()}`,
                    () =>
                      void save({ ...profile, completed: true }, () =>
                        onCapture(`${a.title}: ${profile.areas[a.id]}`),
                      ),
                  )}
              </View>
            ))}
          </View>
          {button(
            "Use Flow",
            () => void save({ ...profile, completed: true }, onClose),
            true,
          )}
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
                  ...newProfile(),
                  areas: profile.areas,
                  completed: profile.completed,
                  stage: "assessment",
                },
                () => setIndex(0),
              ),
          )}
          {button(
            "Remove personality answers",
            () =>
              void save({ ...profile, answers: [], presentation: undefined }),
          )}
        </>
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
