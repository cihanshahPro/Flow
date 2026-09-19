import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Note } from "../model.ts";
import { emptyPlate, OBSTACLES, PLATE_AREAS, PLATE_PEOPLE, TIME_WINDOWS, type Plate, type Profile } from "../personality.ts";
import { flowType } from "../flow-voice.ts";
import { peopleMentioned } from "../thread.ts";
import { C } from "./theme.ts";

export const PRIVACY_URL = "https://kodavena.com/privacy";

/** Profile: who Flow thinks you are and what it knows — a living thing you can edit, not a one-time quiz. */
/** "08:30" moved by `delta` minutes, wrapping around midnight. */
export function shiftTime(time: string, delta: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function Profile({
  profile,
  threads,
  notes,
  busy = false,
  onRetake,
  onFeedback,
  onPlate,
  notificationsOn = true,
  version = "",
  onToggleNotifications,
  morningOn = true,
  morningTime = "08:30",
  onMorning,
  onExport,
  onDeleteAll,
}: {
  profile: Profile;
  threads: ThoughtDraft[];
  notes: Note[];
  busy?: boolean;
  onRetake: () => void;
  onFeedback: (mode: "voice" | "text") => void;
  onPlate: (plate: Plate) => void;
  notificationsOn?: boolean;
  version?: string;
  onToggleNotifications?: (on: boolean) => void;
  morningOn?: boolean;
  morningTime?: string;
  onMorning?: (patch: { morningOff?: boolean; morningTime?: string }) => void;
  onExport?: () => void;
  onDeleteAll?: () => void;
}) {
  const type = flowType(profile.answers);
  const plate = profile.plate ?? emptyPlate();
  const real = threads.filter((t) => !t.example);
  const people = peopleMentioned(real);
  const feedback = notes.filter((n) => n.captureKind === "feedback").length;
  const [editing, setEditing] = useState(false);
  const toggle = (key: "areas" | "people" | "obstacles", label: string) => {
    const current = plate[key];
    onPlate({ ...plate, [key]: current.includes(label) ? current.filter((x) => x !== label) : [...current, label] });
  };
  const Chips = ({ list, chosen, onTap }: { list: readonly string[]; chosen: string[]; onTap: (label: string) => void }) => (
    <View style={s.chips}>
      {[...list, ...chosen.filter((x) => !list.includes(x))].map((label) => {
        const on = chosen.includes(label);
        return (
          <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => onTap(label)} disabled={busy} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && { color: C.white }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Text style={s.brand}>Profile</Text>
        <Text style={s.kicker}>{type ? type.name.toUpperCase() : "NOT SET"}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>YOUR FLOW TYPE</Text>
        <Text style={s.title}>{type ? type.name : "Not set yet"}</Text>
        <Text style={s.body}>{type ? type.line : "The two-minute test tells Flow how you tick."}</Text>
        {type && <Text style={s.bodyStrong}>{type.promise}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={type ? "Redo the test and profile" : "Take the test"} onPress={onRetake} disabled={busy} hitSlop={8}>
          <Text style={s.link}>{type ? "Redo the test and profile" : "Take the test · 2 min"}</Text>
        </Pressable>
      </View>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.kicker}>ON YOUR PLATE</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? "Done editing" : "Edit profile"} onPress={() => setEditing((v) => !v)} hitSlop={8}>
            <Text style={s.link}>{editing ? "Done" : "Edit"}</Text>
          </Pressable>
        </View>
        {editing ? (
          <>
            <Text style={s.small}>What's taking up space</Text>
            <Chips list={PLATE_AREAS} chosen={plate.areas} onTap={(l) => toggle("areas", l)} />
            <Text style={s.small}>Who's in the picture</Text>
            <Chips list={PLATE_PEOPLE} chosen={plate.people} onTap={(l) => toggle("people", l)} />
            <Text style={s.small}>When you get time</Text>
            <Chips list={TIME_WINDOWS} chosen={plate.timeWindow ? [plate.timeWindow] : []} onTap={(l) => onPlate({ ...plate, timeWindow: l })} />
            <Text style={s.small}>What gets in the way</Text>
            <Chips list={OBSTACLES} chosen={plate.obstacles} onTap={(l) => toggle("obstacles", l)} />
          </>
        ) : (
          <>
            {plate.areas.length ? (
              <View style={s.chips}>
                {plate.areas.map((a) => (
                  <View key={a} style={s.chipOnSoft}>
                    <Text style={s.chipTextSoft}>{a}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.body}>Nothing on your plate yet — tap Edit, or Flow learns from what you record.</Text>
            )}
            {(plate.people.length > 0 || people.length > 0) && (
              <Text style={s.body}>
                People: <Text style={s.bodyStrong}>{[...new Set([...plate.people, ...people])].join(", ")}</Text>
              </Text>
            )}
            {!!plate.timeWindow && (
              <Text style={s.body}>
                Your time: <Text style={s.bodyStrong}>{plate.timeWindow}</Text>
              </Text>
            )}
            {plate.obstacles.length > 0 && (
              <Text style={s.body}>
                Usually in the way: <Text style={s.bodyStrong}>{plate.obstacles.join(", ")}</Text>
              </Text>
            )}
          </>
        )}
        <Text style={s.small}>
          {real.length} {real.length === 1 ? "thread" : "threads"} on this phone. Your data stays on this phone.
        </Text>
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
      <View style={s.card}>
        <Text style={s.kicker}>SETTINGS</Text>
        <View style={s.rowBetween}>
          <Text style={[s.body, { flex: 1 }]}>Reminders</Text>
          <Switch accessibilityLabel="Reminders" value={notificationsOn} onValueChange={(v) => onToggleNotifications?.(v)} disabled={busy} />
        </View>
        <View style={s.rowBetween}>
          <Text style={[s.body, { flex: 1 }]}>Morning reminder</Text>
          <Switch accessibilityLabel="Morning reminder" value={morningOn} onValueChange={(v) => onMorning?.({ morningOff: v ? undefined : true })} disabled={busy || !notificationsOn} />
        </View>
        {morningOn && notificationsOn && (
          <View style={s.rowBetween}>
            <Text style={s.small}>Sent at</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Earlier by 30 minutes" hitSlop={10} disabled={busy} onPress={() => onMorning?.({ morningTime: shiftTime(morningTime, -30) })}>
                <Text style={s.link}>−</Text>
              </Pressable>
              <Text style={s.body} accessibilityLabel={`Morning reminder at ${morningTime}`}>{morningTime}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Later by 30 minutes" hitSlop={10} disabled={busy} onPress={() => onMorning?.({ morningTime: shiftTime(morningTime, 30) })}>
                <Text style={s.link}>+</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Export my data" onPress={onExport} disabled={busy} hitSlop={8}>
          <Text style={s.link}>Export my data</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Privacy policy" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})} hitSlop={8}>
          <Text style={s.link}>Privacy policy</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete all my data" onPress={onDeleteAll} disabled={busy} hitSlop={8}>
          <Text style={[s.link, { color: C.danger }]}>Delete all my data</Text>
        </Pressable>
        {!!version && <Text style={s.small}>Flow {version}</Text>}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48, gap: 12, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingRight: 56 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipOnSoft: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.blueSoft },
  chipTextSoft: { fontSize: 13, fontWeight: "600", color: C.blue },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  card: { padding: 18, borderRadius: 20, backgroundColor: C.card, gap: 10 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  bodyStrong: { fontSize: 15, lineHeight: 22, color: C.ink, fontWeight: "600" },
  small: { fontSize: 12, lineHeight: 17, color: C.faint },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 8, backgroundColor: C.blue, borderRadius: 4 },
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  statN: { fontSize: 22, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 12, color: C.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipText: { fontSize: 13, fontWeight: "600", color: C.ink },
  primary: { backgroundColor: C.blue, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: C.white, fontSize: 16, fontWeight: "700" },
});
