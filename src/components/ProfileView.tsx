import { taskState } from "../task-flow.ts";
import ProfileCompletion from "./ProfileCompletion";
import ProgressCard from "./ProgressCard";
import type { ProgressRecord } from "../progress.ts";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { productivityGuide, type Profile } from "../personality";
import { directionOptions, journeyState } from "../journey";
import type { Note, Task } from "../model";
import type { ThoughtDraft } from "../drafts";
export default function ProfileView({
  profile,
  progress,
  notes,
  drafts,
  tasks,
  busy,
  onContinue,
  onCapture,
  onEditAreas,
  onAssessment,
  onPreference,
  onFocus,
  onConfigure,
  onCompleteAssessment,
  onCompleteAreas,
}: {
  profile: Profile;
  progress: ProgressRecord;
  notes: Note[];
  drafts: ThoughtDraft[];
  tasks: Task[];
  busy: boolean;
  onContinue: () => void;
  onCapture: () => void;
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
      {progress.unlockedAt && <ProgressCard progress={progress} />}
      <ProfileCompletion
        profile={profile}
        busy={busy}
        onConfigure={onConfigure}
        onAssessment={onCompleteAssessment}
        onAreas={onCompleteAreas}
      />
      {!progress.unlockedAt && <ProgressCard progress={progress} />}
      <View style={s.card}>
        <Text style={s.kicker}>YOUR CURRENT APPROACH</Text>
        {guide.type && (
          <>
            <Text style={s.heading}>{guide.type.code} · {guide.type.name}</Text>
            <Text style={s.body}>{guide.type.description}</Text>
          </>
        )}
        <Text style={s.heading}>{guide.title}</Text>
        <Text style={s.body}>{guide.reason}</Text>
        {guide.tips.map((t) => (
          <Text key={t} style={s.body}>
            • {t}
          </Text>
        ))}
        {button("Change my guidance style", onPreference)}
      </View>
      {state.next.kind !== "setup" && (
        <View style={s.card}>
          <Text style={s.heading}>
            {state.next.kind === "complete"
              ? "Room for what comes next"
              : "Next, together"}
          </Text>
          <Text style={s.body}>
            {state.next.kind === "complete"
              ? "Your saved steps are finished. You can pause here, or add a new thought when you’re ready."
              : state.next.title}
          </Text>
          {state.next.kind === "complete"
            ? button("Capture a new thought", onCapture)
            : button("Go to my next step", onContinue, true)}
        </View>
      )}
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
            This is a working-style estimate, not a diagnosis. Flow uses it to
            shape the questions and pacing, and you can change the guidance.
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
                  {related.some((t) => taskState(t) === "ready")
                    ? "Action ready"
                    : related.some((t) => !t.done)
                      ? "Steps saved for later or follow-up"
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
  card: { backgroundColor: "white", padding: 22, borderRadius: 24, gap: 12 },
  heading: { fontSize: 18, fontWeight: "600", color: "#142138" },
  body: { fontSize: 15, lineHeight: 23, color: "#52647C" },
  small: { fontSize: 12, lineHeight: 18, color: "#68788C" },
  button: { padding: 16, borderRadius: 16, backgroundColor: "#E9EEF7" },
  primary: { backgroundColor: "#345BEE" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#142138" },
  trait: { gap: 8, paddingVertical: 8 },
});
