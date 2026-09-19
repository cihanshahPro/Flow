import ProfileCompletion from "./ProfileCompletion";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { productivityGuide, type Profile } from "../personality";
import { directionOptions, journeyState } from "../journey";
import type { Note, Task } from "../model";
import type { ThoughtDraft } from "../drafts";
export default function ProfileView({
  profile,
  notes,
  drafts,
  tasks,
  busy,
  onContinue,
  onEditAreas,
  onAssessment,
  onPreference,
  onFocus,
  onConfigure,
  onCompleteAssessment,
  onCompleteAreas,
}: {
  profile: Profile;
  notes: Note[];
  drafts: ThoughtDraft[];
  tasks: Task[];
  busy: boolean;
  onContinue: () => void;
  onEditAreas: () => void;
  onAssessment: () => void;
  onPreference: () => void;
  onFocus: (title: string) => void;
  onConfigure: (patch: Partial<Profile>) => Promise<void>;
  onCompleteAssessment: () => void;
  onCompleteAreas: (areaIndex?: number) => void;
}) {
  const state = journeyState(profile, notes, drafts, tasks);
  const guide = productivityGuide(profile.answers, profile.presentation);
  const [traits, setTraits] = useState(false);
  const [map, setMap] = useState(false);
  const button = (title: string, fn: () => void, primary = false) => (
    <Pressable
      key={title}
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={busy}
      onPress={fn}
      style={[s.button, primary && s.primary]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{title}</Text>
    </Pressable>
  );
  return (
    <View style={s.page}>
      <Text style={s.kicker}>PROFILE · YOUR STARTING POINT, KEPT</Text>
      <Text style={s.title}>A picture of you.</Text>
      <ProfileCompletion
        profile={profile}
        busy={busy}
        onConfigure={onConfigure}
        onAssessment={onCompleteAssessment}
        onAreas={onCompleteAreas}
      />
      <View style={s.level}>
        <Text style={s.kicker}>
          LEVEL {state.level.number} · {state.level.title.toUpperCase()}
        </Text>
        <Text style={s.body}>
          Progress comes from saved plans and completed actions. No streaks to
          protect.
        </Text>
        {state.milestones.map((m) => (
          <Text key={m.label} style={s.body}>
            {m.done ? "✓" : "○"} {m.label}
          </Text>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>YOUR CURRENT APPROACH</Text>
        <Text style={s.heading}>{guide.title}</Text>
        <Text style={s.body}>{guide.reason}</Text>
        {guide.tips.map((t) => (
          <Text key={t} style={s.body}>
            • {t}
          </Text>
        ))}
        {button("Change my guidance style", onPreference)}
      </View>
      <View style={s.card}>
        <Text style={s.heading}>Next, together</Text>
        <Text style={s.body}>{state.next.title}</Text>
        {button("Go to my next step", onContinue, true)}
      </View>
      {button(traits ? "Hide personality details" : "See my personality", () =>
        setTraits(!traits),
      )}
      {traits && (
        <View style={s.card}>
          {guide.traits.length ? (
            guide.traits.map((t) => (
              <View key={t.trait} style={s.trait}>
                <Text style={s.heading}>
                  {t.trait === "Neuroticism" ? "Emotional stability" : t.trait}
                </Text>
                <Text style={s.body}>{t.description}</Text>
              </View>
            ))
          ) : (
            <Text style={s.body}>
              Your assessment is not complete. Your saved work is still
              available.
            </Text>
          )}
          <Text style={s.small}>
            Mini-IPIP describes five traits, not a fixed type. Guidance is an
            adjustable starting recommendation.
          </Text>
          {button(
            profile.answers.length === 20
              ? "Review assessment"
              : "Continue assessment",
            onAssessment,
          )}
        </View>
      )}
      {button(map ? "Hide saved interests" : "See my saved interests", () =>
        setMap(!map),
      )}
      {map && (
        <View style={s.card}>
          {directionOptions(profile).map((d) => {
            const related = tasks.filter(
              (t) => t.direction?.directionId === d.directionId,
            );
            const draft = drafts.some(
              (x) => x.direction?.directionId === d.directionId && !x.example,
            );
            return (
              <View key={d.directionId} style={s.trait}>
                <Text style={s.heading}>{d.choice}</Text>
                <Text style={s.small}>
                  {d.title.split(":")[0]} ·{" "}
                  {related.some((t) => !t.done)
                    ? "Action ready"
                    : related.some((t) => t.done)
                      ? "Action completed"
                      : draft
                        ? "Draft saved"
                        : "Interest saved"}
                </Text>
                {button(`Focus on ${d.choice.toLowerCase()}`, () =>
                  onFocus(d.title),
                )}
              </View>
            );
          })}
          {button("Update life areas", onEditAreas)}
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  page: { gap: 18 },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    color: "#52647C",
  },
  title: { fontSize: 36, fontWeight: "700", color: "#142138" },
  level: { backgroundColor: "#E7EEDB", padding: 22, borderRadius: 24, gap: 10 },
  card: { backgroundColor: "white", padding: 22, borderRadius: 24, gap: 12 },
  heading: { fontSize: 18, fontWeight: "600", color: "#142138" },
  body: { fontSize: 15, lineHeight: 23, color: "#52647C" },
  small: { fontSize: 12, lineHeight: 18, color: "#68788C" },
  button: { padding: 16, borderRadius: 16, backgroundColor: "#E9EEF7" },
  primary: { backgroundColor: "#345BEE" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#142138" },
  trait: { gap: 8, paddingVertical: 8 },
});
