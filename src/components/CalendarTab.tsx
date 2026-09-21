import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { watchOuts, type CalEvent } from "../calendar.ts";
import { localDate } from "../model.ts";
import type { Task } from "../model.ts";
import { DayList, WatchList, WeekStrip } from "./Week.tsx";
import { C } from "./theme.ts";

/**
 * The week as Flow sees it: the person's events, Flow's moves in the gaps,
 * chases, and what to watch out for. Replaces Progress. Read from the phone;
 * Flow's own items are editable there too.
 */
export default function CalendarTab({
  events,
  tasks,
  connected,
  busy = false,
  now = new Date(),
  onConnect,
  onRefresh,
  onSeed,
}: {
  events: CalEvent[];
  tasks: Task[];
  connected: boolean;
  busy?: boolean;
  now?: Date;
  onConnect: () => void;
  onRefresh: () => void;
  /** Dev only: seed a believable week on an empty simulator calendar. */
  onSeed?: () => void;
}) {
  const [day, setDay] = useState<string>(localDate(now));
  const watch = watchOuts(events, now);
  const label = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable onLongPress={onSeed} delayLongPress={1200}>
          <Text style={s.brand}>Calendar</Text>
        </Pressable>
        {connected ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh calendar" onPress={onRefresh} disabled={busy} hitSlop={8}>
            <Text style={s.link}>Refresh</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={s.page}>
        {!connected && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Let Flow see your week</Text>
            <Text style={s.body}>Apple Calendar and any Google calendar on this phone. Flow plans around what's already there and puts its moves in the gaps. Nothing is changed without you.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Connect calendar" onPress={onConnect} disabled={busy} style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.6 }]}>
              <Text style={s.primaryText}>Connect calendar</Text>
            </Pressable>
          </View>
        )}
        <WeekStrip events={events} tasks={tasks} now={now} selected={day} onSelect={setDay} />
        <Text style={s.kicker}>{label.toUpperCase()}</Text>
        <DayList events={events} tasks={tasks} date={day} />
        {watch.length > 0 && (
          <>
            <Text style={s.kicker}>WATCH OUT</Text>
            <WatchList items={watch} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, paddingRight: 84 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  link: { color: C.blue, fontSize: 14, fontWeight: "700", paddingVertical: 6 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  card: { padding: 18, borderRadius: 20, backgroundColor: C.card, gap: 10 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  primary: { backgroundColor: C.blue, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: C.white, fontSize: 16, fontWeight: "700" },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted, marginTop: 6 },
});
