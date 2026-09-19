import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AREAS, ITEMS, type Profile } from "../personality.ts";
import { flowType } from "../flow-voice.ts";
import { C } from "./theme.ts";

const RATINGS = ["Not me", "Not really", "Somewhat", "Mostly", "Very me"];
export const AREA_ACTIVE = "Active";

/**
 * Flow gets to know you: twenty quick taps, a reveal, and what's on your
 * plate. Every screen has one thing to do. Skipping is always allowed.
 */
export default function Quiz({
  profile,
  onSave,
  onFinish,
  busy = false,
  error = "",
}: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
  onFinish: (profile: Profile) => Promise<void>;
  busy?: boolean;
  error?: string;
}) {
  const answered = profile.answers.filter((a) => Number.isInteger(a) && a >= 1 && a <= 5).length;
  const [index, setIndex] = useState(Math.min(answered, ITEMS.length - 1));
  const stage = profile.stage;
  const type = flowType(profile.answers);
  const selected = new Set(
    AREAS.filter((a) => {
      const v = profile.areas[a.id];
      return Array.isArray(v) ? v.includes(AREA_ACTIVE) : v === AREA_ACTIVE;
    }).map((a) => a.id),
  );
  const finish = (p: Profile) =>
    onFinish({
      ...p,
      stage: "guide",
      completed: true,
      areas: Object.fromEntries(AREAS.map((a) => [a.id, selected.has(a.id) ? [AREA_ACTIVE] : ["Nothing current"]])),
    });
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.brand}>
        flow<Text style={{ color: C.blue }}>.</Text>
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {stage === "intro" && (
        <>
          <Text style={s.headline}>Record it once.{"\n"}Flow keeps the thread.</Text>
          <Text style={s.body}>
            Say what's on your mind. Flow works out what it's about, asks you one thing at a time, and shows you a move when it's ready.
          </Text>
          <Text style={s.body}>First, twenty quick taps so Flow knows how you tick.</Text>
          <Primary label="Get to know me · 2 min" onPress={() => void onSave({ ...profile, stage: "assessment" })} busy={busy} />
          <Secondary label="Skip for now" onPress={() => void finish(profile)} busy={busy} />
        </>
      )}
      {stage === "assessment" && (
        <>
          <Text style={s.kicker}>
            {index + 1} OF {ITEMS.length}
          </Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(((index + 1) / ITEMS.length) * 100)}%` }]} />
          </View>
          <Text style={s.headline}>{ITEMS[index].text}</Text>
          <View style={s.ratings}>
            {RATINGS.map((label, i) => {
              const chosen = profile.answers[index] === i + 1;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: chosen }}
                  disabled={busy}
                  onPress={() => {
                    const answers = [...profile.answers];
                    answers[index] = i + 1;
                    const last = index === ITEMS.length - 1;
                    void onSave({ ...profile, answers, stage: last ? "results" : "assessment" }).then(() => {
                      if (!last) setIndex(index + 1);
                    });
                  }}
                  style={({ pressed }) => [s.rating, chosen && s.ratingChosen, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[s.ratingText, chosen && { color: C.white }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {index > 0 ? (
            <Secondary label="Back" onPress={() => setIndex(index - 1)} busy={busy} />
          ) : (
            <Secondary label="Skip the quiz" onPress={() => void finish(profile)} busy={busy} />
          )}
        </>
      )}
      {stage === "results" && (
        <>
          <Text style={s.kicker}>YOUR FLOW TYPE</Text>
          <Text style={s.headline}>{type ? `You're a ${type.name}.` : "Flow has a read on you."}</Text>
          <Text style={s.body}>{type?.line ?? "You told Flow how you tick."}</Text>
          <Text style={s.bodyStrong}>{type?.promise ?? "Flow will keep the thread so you only ever look at one thing."}</Text>
          <Text style={s.small}>Adapted from the Big Five. It shapes how Flow talks to you, never what you have to do.</Text>
          <Primary label="Next" onPress={() => void onSave({ ...profile, stage: "areas" })} busy={busy} />
        </>
      )}
      {stage === "areas" && (
        <>
          <Text style={s.kicker}>LAST THING</Text>
          <Text style={s.headline}>What's on your plate right now?</Text>
          <Text style={s.body}>Tap anything that's active. You can leave it all blank.</Text>
          <View style={s.chips}>
            {AREAS.map((a) => {
              const on = selected.has(a.id);
              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  accessibilityState={{ selected: on }}
                  disabled={busy}
                  onPress={() =>
                    void onSave({
                      ...profile,
                      areas: { ...profile.areas, [a.id]: on ? [] : [AREA_ACTIVE] },
                    })
                  }
                  style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[s.chipText, on && { color: C.white }]}>{a.title}</Text>
                </Pressable>
              );
            })}
          </View>
          <Primary label="Start recording" onPress={() => void finish(profile)} busy={busy} />
        </>
      )}
    </ScrollView>
  );
}

function Primary({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy} style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.6 }]}>
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}
function Secondary({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy} hitSlop={8} style={{ alignSelf: "center", paddingVertical: 8 }}>
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: 24, paddingBottom: 48, gap: 16, flexGrow: 1, justifyContent: "center", backgroundColor: C.paper },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  headline: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: C.ink },
  body: { fontSize: 17, lineHeight: 25, color: C.muted },
  bodyStrong: { fontSize: 17, lineHeight: 25, color: C.ink, fontWeight: "600" },
  small: { fontSize: 12, lineHeight: 17, color: C.faint },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },
  ratings: { gap: 8 },
  rating: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  ratingChosen: { backgroundColor: C.blue, borderColor: C.blue },
  ratingText: { fontSize: 16, fontWeight: "600", color: C.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { fontSize: 15, fontWeight: "600", color: C.ink },
  primary: { backgroundColor: C.blue, borderRadius: 18, paddingVertical: 17, alignItems: "center", marginTop: 8 },
  primaryText: { color: C.white, fontSize: 17, fontWeight: "700" },
  link: { color: C.blue, fontSize: 15, fontWeight: "600" },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
});
