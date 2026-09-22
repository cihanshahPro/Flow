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
import { eventsOn, timeLabel, watchOuts, weekDays, type CalEvent } from "../calendar.ts";
import { C } from "./theme.ts";

const RATINGS = ["Not me", "Not really", "Somewhat", "Mostly", "Very me"];

/**
 * The funnel: Welcome → Connect calendar → Record. Four taps from install to
 * a planned week. The personality test and profile questions remain as
 * optional steps reachable from Profile only; they are not in the path.
 */
export type FunnelStep = "intro" | "calendar" | "week" | "test" | "reveal" | "plate" | "first";

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

export const FIRST_QUESTION = "What's on your mind right now?";
export const FIRST_PROMPT = `${FIRST_QUESTION} Everything, in any order. Don't organise it — Flow sorts it and shows you your week.`;

export default function Funnel({
  profile,
  step,
  onStep,
  onSave,
  onFinish,
  onRecordFirst,
  onWriteFirst,
  onExit,
  onConnectCalendar,
  calendarConnected = false,
  events = [],
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
  /** Leave the optional test/profile for later (only offered after the first thread). */
  onExit?: () => void;
  /** Asks the phone once; resolves true when Flow may read the calendar. */
  onConnectCalendar?: () => Promise<boolean>;
  calendarConnected?: boolean;
  /** The phone's week, once connected: shown before the first recording so Flow's read comes first. */
  events?: CalEvent[];
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
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.brandRow}>
        <Text style={s.brand}>
          flow<Text style={{ color: C.blue }}>.</Text>
        </Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {step === "intro" && (
        <>
          <Text style={s.headline}>Say it once.{"\n"}Your week plans itself.</Text>
          <Text style={s.body}>Talk about everything on your mind. Flow sorts it, puts it on your calendar around what's already there, and tells you what today looks like.</Text>
          <Primary label="Get started" onPress={() => onStep(calendarConnected ? "week" : "calendar")} busy={busy} />
        </>
      )}
      {step === "calendar" && (
        <>
          <Text style={s.kicker}>1 OF 2</Text>
          <Text style={s.headline}>Let Flow see your week</Text>
          <Text style={s.body}>Apple Calendar and any Google calendar on this phone, through one permission. Flow plans around what's already there and puts its moves in the gaps. It never changes your events.</Text>
          <Primary
            label="Connect calendar"
            onPress={() => void (onConnectCalendar ? onConnectCalendar() : Promise.resolve(false)).then((ok) => onStep(ok ? "week" : "first"))}
            busy={busy}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => onStep("first")} hitSlop={8} style={{ alignSelf: "center" }}>
            <Text style={s.link}>Not now</Text>
          </Pressable>
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
          {onExit && <Secondary label="Not now" onPress={onExit} busy={busy} />}
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
              else void onFinish({ ...profile, assessmentLaterAt: undefined });
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
      {step === "week" && (
        <>
          <Text style={s.kicker}>FLOW SEES YOUR WEEK</Text>
          <Text style={s.headline}>Apple + Google, read once · nothing changed</Text>
          <View style={s.week}>
            {weekDays(new Date(), 7).map((date) => {
              const d = new Date(`${date}T12:00:00`);
              const on = eventsOn(events, date).filter((e) => !e.mine);
              return (
                <View key={date} style={s.weekRow}>
                  <Text style={s.weekDay}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} {d.getDate()}</Text>
                  <Text style={s.weekEvents} numberOfLines={2}>{on.length ? on.map((e) => `${e.title}${e.allDay ? "" : " " + timeLabel(e.start)}`).join(" · ") : "—"}</Text>
                </View>
              );
            })}
          </View>
          {watchOuts(events, new Date(), 7).length > 0 && (
            <>
              <Text style={s.kicker}>WATCH OUT</Text>
              {watchOuts(events, new Date(), 7).map((w, i) => (
                <Text key={i} style={s.body}>
                  <Text style={s.bodyStrong}>{w.title}</Text> · {w.note}
                </Text>
              ))}
            </>
          )}
          <Text style={s.bodyStrong}>Got your week. Now tell me what's on your mind — everything, in any order.</Text>
          <Primary label="Record" onPress={() => void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onRecordFirst(FIRST_PROMPT))} busy={busy} />
          <Secondary label="or type it" onPress={() => void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onWriteFirst(FIRST_PROMPT))} busy={busy} />
        </>
      )}
      {step === "first" && (
        <>
          <Text style={s.kicker}>2 OF 2</Text>
          <Text style={s.headline}>{FIRST_QUESTION}</Text>
          <Text style={s.body}>Everything, in any order — the lawyer, the app, the thing you keep forgetting. Don't organise it.</Text>
          <Text style={s.small}>Flow sorts it and shows you your week. No questions.</Text>
          {/* Two equal ways in; the microphone is only asked for once Talk is chosen. */}
          <View style={s.choices}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Talk it out"
              onPress={() =>
                void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onRecordFirst(FIRST_PROMPT))
              }
              disabled={busy}
              style={({ pressed }) => [s.choice, (pressed || busy) && { opacity: 0.6 }]}
            >
              <Text style={s.choiceIcon}>🎙️</Text>
              <Text style={s.choiceText}>Talk it out</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Type it"
              onPress={() =>
                void onFinish({ ...profile, completed: true, stage: "guide", funnelVersion: FUNNEL_VERSION }).then(() => onWriteFirst(FIRST_PROMPT))
              }
              disabled={busy}
              style={({ pressed }) => [s.choice, (pressed || busy) && { opacity: 0.6 }]}
            >
              <Text style={s.choiceIcon}>⌨️</Text>
              <Text style={s.choiceText}>Type it</Text>
            </Pressable>
          </View>
          <Text style={[s.small, { textAlign: "center" }]}>Your voice stays on your iPhone.</Text>
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
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  headline: { fontSize: 29, lineHeight: 35, fontWeight: "700", color: C.ink },
  body: { fontSize: 17, lineHeight: 25, color: C.muted },
  bodyStrong: { fontSize: 17, lineHeight: 25, color: C.ink, fontWeight: "600" },
  small: { fontSize: 12, lineHeight: 17, color: C.faint },
  choices: { flexDirection: "row", gap: 12, marginTop: 8 },
  choice: { flex: 1, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 20, alignItems: "center", gap: 6 },
  choiceIcon: { fontSize: 26 },
  choiceText: { color: C.white, fontSize: 17, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },
  ratings: { gap: 8 },
  rating: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  ratingChosen: { backgroundColor: C.blue, borderColor: C.blue },
  ratingText: { fontSize: 16, fontWeight: "600", color: C.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { fontSize: 15, fontWeight: "600", color: C.ink },
  nameRow: { flexDirection: "row" },
  nameInput: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, fontSize: 15, color: C.ink },
  primary: { backgroundColor: C.blue, borderRadius: 18, paddingVertical: 17, alignItems: "center", marginTop: 8 },
  primaryText: { color: C.white, fontSize: 17, fontWeight: "700" },
  link: { color: C.blue, fontSize: 15, fontWeight: "600" },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 22, paddingVertical: 22, marginTop: 8 },
  recordIcon: { color: C.record, fontSize: 20 },
  recordText: { color: C.white, fontSize: 19, fontWeight: "700" },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
  week: { gap: 6, marginTop: 4 },
  weekRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  weekDay: { width: 58, fontSize: 11, letterSpacing: 1, fontWeight: "700", color: C.ink3, paddingTop: 2 },
  weekEvents: { flex: 1, fontSize: 14, lineHeight: 20, color: C.ink },
});
