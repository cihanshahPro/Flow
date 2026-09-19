import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  DATED_SOON,
  FUNNEL_VERSION,
  ITEMS,
  OBSTACLES,
  PLATE_AREAS,
  PLATE_PEOPLE,
  TIME_WINDOWS,
  emptyPlate,
  type Plate,
  type Profile,
} from "../personality.ts";
import { flowType } from "../flow-voice.ts";
import { C } from "./theme.ts";

export const BUILD_TAG = "TEST 12";
const RATINGS = ["Not me", "Not really", "Somewhat", "Mostly", "Very me"];

/**
 * The funnel. Every device goes through it once, in order, with one thing to
 * do per screen:
 *   1. the personality test (twenty taps, not skippable)
 *   2. the reveal
 *   3. five guided profile questions answered by tapping suggestions
 *   4. the first thread, prompted from the profile
 */
export type FunnelStep = "intro" | "test" | "reveal" | "plate" | "first";

export const PLATE_QUESTIONS: {
  key: keyof Plate;
  kicker: string;
  title: string;
  hint: string;
  options: readonly string[];
  multi: boolean;
  allowName?: boolean;
}[] = [
  { key: "areas", kicker: "1 OF 5", title: "What's taking up space in your head right now?", hint: "Tap everything that applies.", options: PLATE_AREAS, multi: true },
  { key: "people", kicker: "2 OF 5", title: "Who's in the picture most these days?", hint: "The people your threads will keep coming back to.", options: PLATE_PEOPLE, multi: true, allowName: true },
  { key: "timeWindow", kicker: "3 OF 5", title: "When do you actually get time for this stuff?", hint: "Flow will offer moves for that moment.", options: TIME_WINDOWS, multi: false },
  { key: "obstacles", kicker: "4 OF 5", title: "What usually gets in the way?", hint: "Flow will ask about these first when a thread stalls.", options: OBSTACLES, multi: true },
  { key: "datedSoon", kicker: "5 OF 5", title: "Anything with a real date on it coming up?", hint: "Just yes or no — you'll tell Flow the details when you record.", options: DATED_SOON, multi: false },
];

export function firstPrompt(plate: Plate | undefined): { area: string; prompt: string } {
  const area = plate?.areas[0] ?? "the thing on your mind";
  return {
    area,
    prompt: `Tell me about ${area.toLowerCase()}: where it stands, what you'd want to come out of it, who's involved, and what's in the way. Don't organise it — just talk.`,
  };
}

export default function Funnel({
  profile,
  step,
  onStep,
  onSave,
  onFinish,
  onRecordFirst,
  onWriteFirst,
  busy = false,
  error = "",
}: {
  profile: Profile;
  step: FunnelStep;
  onStep: (step: FunnelStep) => void;
  onSave: (profile: Profile) => Promise<void>;
  onFinish: (profile: Profile) => Promise<void>;
  onRecordFirst: (prompt: string) => void;
  onWriteFirst: (prompt: string) => void;
  busy?: boolean;
  error?: string;
}) {
  const answers = profile.answers;
  const answered = answers.filter((a) => Number.isInteger(a) && a >= 1 && a <= 5).length;
  const [index, setIndex] = useState(0);
  const [plateIndex, setPlateIndex] = useState(0);
  const [name, setName] = useState("");
  const plate = profile.plate ?? emptyPlate();
  const type = flowType(answers);
  const question = PLATE_QUESTIONS[plateIndex];
  const chosen = (key: keyof Plate): string[] => {
    const v = plate[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const savePlate = (next: Plate) => onSave({ ...profile, plate: next });
  const toggle = (label: string) => {
    if (question.multi) {
      const current = chosen(question.key);
      const next = current.includes(label) ? current.filter((x) => x !== label) : [...current, label];
      void savePlate({ ...plate, [question.key]: next });
    } else {
      void savePlate({ ...plate, [question.key]: label });
    }
  };
  const first = firstPrompt(plate);
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.brandRow}>
        <Text style={s.brand}>
          flow<Text style={{ color: C.blue }}>.</Text>
        </Text>
        <Text style={s.tag}>{BUILD_TAG}</Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {step === "intro" && (
        <>
          <Text style={s.headline}>Record it once.{"\n"}Flow keeps the thread.</Text>
          <Text style={s.body}>
            First, a two-minute personality test. Flow uses it to decide how to talk to you and which question to ask first.
          </Text>
          <Text style={s.body}>Then five quick taps about what's on your plate, and your first thread.</Text>
          <Primary label="Start the test" onPress={() => onStep("test")} busy={busy} />
        </>
      )}
      {step === "test" && (
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
              const picked = answers[index] === i + 1;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: picked }}
                  disabled={busy}
                  onPress={() => {
                    const next = [...answers];
                    next[index] = i + 1;
                    const last = index === ITEMS.length - 1;
                    void onSave({ ...profile, answers: next }).then(() => {
                      if (last) onStep("reveal");
                      else setIndex(index + 1);
                    });
                  }}
                  style={({ pressed }) => [s.rating, picked && s.ratingChosen, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[s.ratingText, picked && { color: C.white }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {index > 0 && <Secondary label="Back" onPress={() => setIndex(index - 1)} busy={busy} />}
        </>
      )}
      {step === "reveal" && (
        <>
          <Text style={s.kicker}>YOUR FLOW TYPE</Text>
          <Text style={s.headline}>{type ? `You're a ${type.name}.` : "Flow has a read on you."}</Text>
          <Text style={s.body}>{type?.line ?? "You told Flow how you tick."}</Text>
          <Text style={s.bodyStrong}>{type?.promise ?? "Flow will keep the thread so you only ever look at one thing."}</Text>
          <Text style={s.small}>Adapted from the Big Five (Mini-IPIP). It shapes how Flow talks to you, never what you have to do.</Text>
          <Primary label="Build my profile" onPress={() => onStep("plate")} busy={busy} disabled={answered < ITEMS.length} />
        </>
      )}
      {step === "plate" && (
        <>
          <Text style={s.kicker}>YOUR PROFILE · {question.kicker}</Text>
          <Text style={s.headline}>{question.title}</Text>
          <Text style={s.body}>{question.hint}</Text>
          <View style={s.chips}>
            {[...question.options, ...(question.allowName ? chosen(question.key).filter((x) => !(question.options as readonly string[]).includes(x)) : [])].map((label) => {
              const on = chosen(question.key).includes(label);
              return (
                <Pressable
                  key={label}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: on }}
                  disabled={busy}
                  onPress={() => toggle(label)}
                  style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[s.chipText, on && { color: C.white }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {question.allowName && (
            <View style={s.nameRow}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Add a name"
                placeholderTextColor={C.faint}
                accessibilityLabel="Add a name"
                style={s.nameInput}
                maxLength={40}
                onSubmitEditing={() => {
                  const trimmed = name.trim();
                  if (!trimmed) return;
                  void savePlate({ ...plate, people: [...new Set([...plate.people, trimmed])] });
                  setName("");
                }}
                returnKeyType="done"
              />
            </View>
          )}
          <Primary
            label={plateIndex === PLATE_QUESTIONS.length - 1 ? "Done" : "Next"}
            onPress={() => {
              if (plateIndex < PLATE_QUESTIONS.length - 1) setPlateIndex(plateIndex + 1);
              else onStep("first");
            }}
            busy={busy}
            disabled={!question.multi && chosen(question.key).length === 0}
          />
          {plateIndex > 0 ? (
            <Secondary label="Back" onPress={() => setPlateIndex(plateIndex - 1)} busy={busy} />
          ) : (
            question.multi && <Text style={s.small}>Nothing that fits? Just tap Next.</Text>
          )}
        </>
      )}
      {step === "first" && (
        <>
          <Text style={s.kicker}>YOUR FIRST THREAD</Text>
          <Text style={s.headline}>Let's start with {first.area.toLowerCase()}.</Text>
          <Text style={s.body}>{first.prompt}</Text>
          <Text style={s.small}>Flow will turn it into a thread, ask you one thing at a time, and offer a move when it has enough.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record"
            onPress={() =>
              void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onRecordFirst(first.prompt))
            }
            disabled={busy}
            style={({ pressed }) => [s.record, (pressed || busy) && { opacity: 0.6 }]}
          >
            <Text style={s.recordIcon}>●</Text>
            <Text style={s.recordText}>Record</Text>
          </Pressable>
          <Secondary
            label="or write it down"
            onPress={() =>
              void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onWriteFirst(first.prompt))
            }
            busy={busy}
          />
        </>
      )}
    </ScrollView>
  );
}

function Primary({ label, onPress, busy, disabled = false }: { label: string; onPress: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [s.primary, (pressed || busy || disabled) && { opacity: 0.55 }]}
    >
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
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  tag: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.faint },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  headline: { fontSize: 29, lineHeight: 35, fontWeight: "700", color: C.ink },
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
  nameRow: { flexDirection: "row" },
  nameInput: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, fontSize: 15, color: C.ink },
  primary: { backgroundColor: C.blue, borderRadius: 18, paddingVertical: 17, alignItems: "center", marginTop: 8 },
  primaryText: { color: C.white, fontSize: 17, fontWeight: "700" },
  link: { color: C.blue, fontSize: 15, fontWeight: "600" },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 22, paddingVertical: 22, marginTop: 8 },
  recordIcon: { color: "#FF6B6B", fontSize: 20 },
  recordText: { color: C.white, fontSize: 19, fontWeight: "700" },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
});
