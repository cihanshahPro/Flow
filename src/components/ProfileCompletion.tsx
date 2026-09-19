import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  profileCompletion,
  type CompletionSectionId,
} from "../profile-completion";
import { directionOptions } from "../journey";
import { AREAS, productivityGuide, type Profile } from "../personality";
type Props = {
  profile: Profile;
  busy: boolean;
  onConfigure: (patch: Partial<Profile>) => Promise<void>;
  onAssessment: () => void;
  onAreas: (areaIndex?: number) => void;
};
export default function ProfileCompletion({
  profile,
  busy,
  onConfigure,
  onAssessment,
  onAreas,
}: Props) {
  const completion = profileCompletion(profile);
  const [editor, setEditor] = useState<CompletionSectionId | null>(null);
  const [checklist, setChecklist] = useState(false);
  const [alternatives, setAlternatives] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const guide = productivityGuide(profile.answers, profile.presentation);
  const directions = directionOptions(profile);
  const focus =
    directions.find((d) => d.title === profile.focus) ?? directions[0];
  const button = (label: string, fn: () => void, primary = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || saving}
      onPress={fn}
      style={[
        s.button,
        primary && s.primary,
        (busy || saving) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{label}</Text>
    </Pressable>
  );
  function open(id: CompletionSectionId) {
    setError("");
    setAlternatives(false);
    if (id === "assessment") onAssessment();
    else if (
      id === "areas" &&
      !completion.sections.find((s) => s.id === id)?.complete
    )
      onAreas();
    else setEditor(id);
  }
  async function save(patch: Partial<Profile>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await onConfigure(patch);
      setEditor(null);
    } catch {
      setError(
        "Could not save this preference. Your previous profile is safe. Try again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const labels = {
    assessment: "Finish personality questions",
    areas: "Finish life areas",
    focus: "Confirm my focus",
    guidance: "Confirm my guidance",
    capacity: "Set my available time",
  };
  return (
    <View style={s.card}>
      <Text style={s.kicker}>PROFILE COMPLETION</Text>
      <View style={s.head}>
        <Text style={s.percent}>{completion.percent}%</Text>
        <Text style={s.body}>
          {completion.completedCount} of 5 sections complete
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Profile completion"
        accessibilityValue={{ min: 0, max: 100, now: completion.percent }}
        style={s.track}
      >
        <View style={[s.fill, { width: `${completion.percent}%` }]} />
      </View>
      {editor === null ? (
        <>
          {completion.next ? (
            <>
              <Text style={s.heading}>Next: {completion.next.title}</Text>
              <Text style={s.body}>{completion.next.why}</Text>
              {button(
                labels[completion.next.id],
                () => open(completion.next!.id),
                true,
              )}
            </>
          ) : (
            <>
              <Text style={s.heading}>Your starting profile is ready.</Text>
              <Text style={s.body}>
                Flow has your current setup preferences. Keep them updated as
                life changes.
              </Text>
            </>
          )}
          {button(
            checklist
              ? "Hide completion checklist"
              : completion.percent === 100
                ? "Review my profile"
                : "See what’s missing",
            () => setChecklist(!checklist),
          )}
          {checklist && (
            <View style={s.list}>
              {completion.sections.map((section) => (
                <View key={section.id} style={s.section}>
                  <Text style={s.heading}>
                    {section.complete ? "✓" : "○"} {section.title}
                  </Text>
                  <Text style={s.body}>{section.detail}</Text>
                  <Text style={s.small}>{section.why}</Text>
                  {button(
                    `${section.complete ? "Edit" : "Complete"} ${section.title.toLowerCase()}`,
                    () => open(section.id),
                  )}
                </View>
              ))}
              <Text style={s.small}>
                Five sections contribute 20% each. Questions and life areas earn
                partial credit as you save them. This measures supplied profile
                information, not personality accuracy or completed tasks.
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={s.list}>
          {editor === "areas" && (
            <>
              <Text style={s.heading}>Which area needs updating?</Text>
              {AREAS.map((a, i) => button(a.title, () => onAreas(i)))}
            </>
          )}
          {editor === "focus" && (
            <>
              <Text style={s.heading}>What should Flow lead with?</Text>
              {focus ? (
                <>
                  <Text style={s.body}>
                    Start with {focus.choice.toLowerCase()}. Your other
                    interests stay saved.
                  </Text>
                  {button(
                    `Use ${focus.choice.toLowerCase()} as my focus`,
                    () =>
                      void save({
                        focus: focus.title,
                        focusExplicit: true,
                        focusNone: false,
                      }),
                    true,
                  )}
                  {directions.length > 1 &&
                    button(
                      alternatives
                        ? "Hide other interests"
                        : "Choose another saved interest",
                      () => setAlternatives(!alternatives),
                    )}
                  {alternatives &&
                    directions
                      .filter((d) => d.title !== focus.title)
                      .map((d) =>
                        button(
                          d.choice,
                          () =>
                            void save({
                              focus: d.title,
                              focusExplicit: true,
                              focusNone: false,
                            }),
                        ),
                      )}
                </>
              ) : (
                <>
                  <Text style={s.body}>
                    You have no selected interests. You can confirm that nothing
                    needs a focus right now.
                  </Text>
                  {button(
                    "No active focus right now",
                    () =>
                      void save({
                        focus: undefined,
                        focusExplicit: false,
                        focusNone: true,
                      }),
                    true,
                  )}
                  {button("Choose a life area", () => onAreas())}
                </>
              )}
            </>
          )}
          {editor === "guidance" && (
            <>
              <Text style={s.heading}>{guide.title}</Text>
              <Text style={s.body}>
                This sets how Flow presents your next steps. You can change it
                later.
              </Text>
              {button(
                guide.presentation === "small"
                  ? "Use smaller first actions"
                  : "Use a visible step sequence",
                () => void save({ presentation: guide.presentation }),
                true,
              )}
              {button(
                guide.presentation === "small"
                  ? "I prefer a step sequence"
                  : "I prefer smaller actions",
                () =>
                  void save({
                    presentation:
                      guide.presentation === "small" ? "sequence" : "small",
                  }),
              )}
            </>
          )}
          {editor === "capacity" && (
            <>
              <Text style={s.heading}>How much time usually fits?</Text>
              <Text style={s.body}>
                This sets Today’s initial time filter. You can adjust it for
                each day.
              </Text>
              {([10, 30, 60] as const).map((n) =>
                button(
                  `${n} minutes`,
                  () => void save({ preferredMinutes: n }),
                  profile.preferredMinutes === n,
                ),
              )}
              {button(
                "It varies — I’ll choose each day",
                () => void save({ preferredMinutes: "varies" }),
              )}
            </>
          )}
          {button("Back to profile", () => {
            setEditor(null);
            setError("");
          })}
        </View>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: "#EAF0FF", padding: 22, borderRadius: 24, gap: 14 },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    color: "#52647C",
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 14,
    flexWrap: "wrap",
  },
  percent: { fontSize: 48, fontWeight: "700", color: "#142138" },
  heading: { fontSize: 18, fontWeight: "600", color: "#142138" },
  body: { fontSize: 15, lineHeight: 23, color: "#52647C" },
  small: { fontSize: 12, lineHeight: 18, color: "#68788C" },
  track: {
    height: 7,
    backgroundColor: "#CBD6EB",
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: { height: 7, backgroundColor: "#345BEE" },
  button: { padding: 16, borderRadius: 16, backgroundColor: "#DCE5F7" },
  primary: { backgroundColor: "#345BEE" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#142138" },
  list: { gap: 14 },
  section: {
    gap: 7,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#CBD6EB",
  },
  error: { color: "#A12B32", fontSize: 14, lineHeight: 20 },
});
