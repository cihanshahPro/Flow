import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Note } from "../model.ts";
import { AREAS, type Profile } from "../personality.ts";
import { flowType } from "../flow-voice.ts";
import { levelForProgress, type ProgressRecord } from "../progress.ts";
import { peopleMentioned, repeatedPattern } from "../thread.ts";
import { AREA_ACTIVE } from "./Quiz.tsx";
import { C } from "./theme.ts";

/** Me: who Flow thinks you are, how far you've come, and what it has noticed. The trust layer. */
export default function Me({
  profile,
  progress,
  threads,
  notes,
  busy = false,
  onBack,
  onRetake,
  onFeedback,
}: {
  profile: Profile;
  progress: ProgressRecord;
  threads: ThoughtDraft[];
  notes: Note[];
  busy?: boolean;
  onBack: () => void;
  onRetake: () => void;
  onFeedback: (mode: "voice" | "text") => void;
}) {
  const type = flowType(profile.answers);
  const level = levelForProgress(progress);
  const active = AREAS.filter((a) => {
    const v = profile.areas[a.id];
    return Array.isArray(v) ? v.includes(AREA_ACTIVE) : v === AREA_ACTIVE;
  });
  const real = threads.filter((t) => !t.example);
  const people = peopleMentioned(real);
  const pattern = repeatedPattern(real);
  const patternsUnlocked = (level.level?.number ?? 0) >= 3;
  const feedback = notes.filter((n) => n.captureKind === "feedback").length;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onBack} hitSlop={12}>
          <Text style={s.link}>‹ Home</Text>
        </Pressable>
        <Text style={s.kicker}>ME</Text>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>YOUR FLOW TYPE</Text>
        <Text style={s.title}>{type ? type.name : "Not set yet"}</Text>
        <Text style={s.body}>{type ? type.line : "Twenty quick taps and Flow will know how you tick."}</Text>
        {type && <Text style={s.bodyStrong}>{type.promise}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={type ? "Retake the quiz" : "Take the quiz"} onPress={onRetake} disabled={busy} hitSlop={8}>
          <Text style={s.link}>{type ? "Retake the quiz" : "Take the quiz · 2 min"}</Text>
        </Pressable>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>YOUR LEVEL</Text>
        {level.unlocked && level.level && level.next ? (
          <>
            <Text style={s.title}>{level.level.title}</Text>
            <View
              style={s.track}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: level.next.threshold, now: level.completedCount }}
            >
              <View style={[s.fill, { width: `${Math.min(100, Math.round((level.completedCount / level.next.threshold) * 100))}%` }]} />
            </View>
            <Text style={s.body}>
              {level.next.remaining} more to {level.next.title}. No streaks, nothing expires.
            </Text>
            <View style={s.stats}>
              <Stat n={level.movesDone} label="moves done" />
              <Stat n={level.threadsUnderstood} label="threads understood" />
              <Stat n={level.checkIns} label="check-ins kept" />
            </View>
          </>
        ) : (
          <Text style={s.body}>Levels start once you've done the quiz. Moves you finish and threads Flow understands count.</Text>
        )}
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>WHAT FLOW KNOWS</Text>
        {active.length ? (
          <View style={s.chips}>
            {active.map((a) => (
              <View key={a.id} style={s.chip}>
                <Text style={s.chipText}>{a.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.body}>Nothing on your plate yet — Flow learns from what you record.</Text>
        )}
        {people.length > 0 && (
          <Text style={s.body}>
            People you've mentioned: <Text style={s.bodyStrong}>{people.join(", ")}</Text>
          </Text>
        )}
        <Text style={s.body}>
          {real.length} {real.length === 1 ? "thread" : "threads"} on this phone. Nothing leaves it except audio to your own Mac mini.
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>FLOW NOTICED</Text>
        {!patternsUnlocked ? (
          <Text style={s.body}>Pattern notices unlock at Momentum.</Text>
        ) : pattern ? (
          <>
            <Text style={s.bodyStrong}>“{pattern.title}” came up in {pattern.count} threads.</Text>
            <Text style={s.body}>Flow will keep watching. Nothing is turned into a routine on its own.</Text>
          </>
        ) : (
          <Text style={s.body}>No repeats yet. Flow will say so when something keeps coming up.</Text>
        )}
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>TELL FLOW SOMETHING</Text>
        <Text style={s.body}>About Flow itself — what's confusing, what helped. It stays on this phone and never becomes a thread.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Record feedback" onPress={() => onFeedback("voice")} disabled={busy} style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={s.primaryText}>Record feedback</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Write feedback" onPress={() => onFeedback("text")} disabled={busy} hitSlop={8} style={{ alignSelf: "center" }}>
          <Text style={s.link}>or write it</Text>
        </Pressable>
        {feedback > 0 && <Text style={s.small}>{feedback} saved so far. Not sent anywhere.</Text>}
      </View>
      <Text style={s.small}>Testing build. Recordings and transcripts stay on this device.</Text>
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48, gap: 12, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  card: { padding: 18, borderRadius: 20, backgroundColor: C.white, gap: 10 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  bodyStrong: { fontSize: 15, lineHeight: 22, color: C.ink, fontWeight: "600" },
  small: { fontSize: 12, lineHeight: 17, color: C.faint, textAlign: "center" },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 8, backgroundColor: C.blue, borderRadius: 4 },
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  statN: { fontSize: 22, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 12, color: C.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.blueSoft },
  chipText: { fontSize: 13, fontWeight: "600", color: C.blue },
  primary: { backgroundColor: C.blue, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: C.white, fontSize: 16, fontWeight: "700" },
});
