import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { eventsOn, timeLabel, weekDays, type CalEvent, type WatchOut } from "../calendar.ts";
import type { Task } from "../model.ts";
import { C } from "./theme.ts";

/** Seven days, the person's events in grey, Flow's in blue, chases in amber. Tap a day to see it. */
export function WeekStrip({ events, tasks = [], now = new Date(), selected, onSelect }: { events: CalEvent[]; tasks?: Task[]; now?: Date; selected?: string; onSelect?: (date: string) => void }) {
  const days = weekDays(now, 7);
  const today = days[0];
  return (
    <View style={s.strip}>
      {days.map((date) => {
        const on = eventsOn(events, date);
        const chases = tasks.filter((t) => !t.done && t.kind === "waiting" && t.chaseDate === date && !t.reminderId);
        const d = new Date(`${date}T12:00:00`);
        const active = selected === date;
        return (
          <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${d.toLocaleDateString("en-US", { weekday: "long", day: "numeric" })}: ${on.length + chases.length} things`} onPress={() => onSelect?.(date)} style={[s.day, active && s.dayActive]}>
            <Text style={s.dayName}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</Text>
            <Text style={[s.dayNum, date === today && s.dayToday]}>{d.getDate()}</Text>
            <View style={s.pills}>
              {on.slice(0, 3).map((e) => (
                <View key={e.id} style={[s.pill, e.mine ? s.pillMine : s.pillTheirs]}>
                  <Text numberOfLines={1} style={[s.pillText, e.mine && s.pillTextMine]}>
                    {e.title}
                  </Text>
                </View>
              ))}
              {chases.slice(0, 1).map((t) => (
                <View key={t.id} style={[s.pill, s.pillChase]}>
                  <Text numberOfLines={1} style={[s.pillText, s.pillTextChase]}>
                    Chase {t.waitingOn}
                  </Text>
                </View>
              ))}
              {on.length > 3 && <Text style={s.more}>+{on.length - 3}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One day as a list: all-day first, then by time; Flow's items marked. */
export function DayList({ events, tasks = [], date, onOpenTask }: { events: CalEvent[]; tasks?: Task[]; date: string; onOpenTask?: (task: Task) => void }) {
  const on = eventsOn(events, date);
  const chases = tasks.filter((t) => !t.done && t.kind === "waiting" && t.chaseDate === date);
  const unplaced = tasks.filter((t) => !t.done && t.kind !== "waiting" && !t.later && t.plannedDate === date && !t.eventId);
  if (!on.length && !chases.length && !unplaced.length) return <Text style={s.empty}>Nothing on this day.</Text>;
  return (
    <View style={s.list}>
      {on.map((e) => (
        <View key={e.id} style={[s.rowItem, e.mine && s.rowMine]}>
          <Text style={[s.time, e.mine && s.timeMine]}>{e.allDay ? "all day" : timeLabel(e.start)}</Text>
          <Text style={[s.itemTitle, e.mine && s.itemTitleMine]} numberOfLines={2}>
            {e.title}
          </Text>
        </View>
      ))}
      {unplaced.map((t) => (
        <Pressable key={t.id} onPress={() => onOpenTask?.(t)} style={[s.rowItem, s.rowMine]}>
          <Text style={[s.time, s.timeMine]}>{t.plannedTime || "any time"}</Text>
          <Text style={[s.itemTitle, s.itemTitleMine]} numberOfLines={2}>
            {t.title}
          </Text>
        </Pressable>
      ))}
      {chases.map((t) => (
        <View key={t.id} style={[s.rowItem, s.rowChase]}>
          <Text style={[s.time, s.timeChase]}>chase</Text>
          <Text style={[s.itemTitle, s.itemTitleChase]} numberOfLines={2}>
            {t.waitingOn}: {t.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function WatchList({ items }: { items: WatchOut[] }) {
  if (!items.length) return null;
  return (
    <View style={s.list}>
      {items.map((w, i) => (
        <View key={`${w.kind}-${w.date}-${i}`} style={[s.rowItem, s.rowChase]}>
          <Text style={[s.time, s.timeChase]}>{w.kind === "full" ? "full" : w.kind === "trip" ? "away" : w.kind === "occasion" ? "date" : "soon"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle} numberOfLines={1}>
              {w.title}
            </Text>
            <Text style={s.note}>{w.note}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { flexDirection: "row", gap: 3, backgroundColor: C.card, borderRadius: 16, padding: 8 },
  day: { flex: 1, alignItems: "center", gap: 2, borderRadius: 10, paddingVertical: 4, minHeight: 92 },
  dayActive: { backgroundColor: C.blueSoft },
  dayName: { fontSize: 9, fontWeight: "700", color: C.muted, letterSpacing: 0.5 },
  dayNum: { fontSize: 14, fontWeight: "700", color: C.ink, width: 24, height: 24, lineHeight: 24, textAlign: "center", borderRadius: 12, overflow: "hidden" },
  dayToday: { backgroundColor: C.blue, color: C.white },
  pills: { width: "100%", gap: 2, paddingHorizontal: 1 },
  pill: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 2 },
  pillTheirs: { backgroundColor: C.line },
  pillMine: { backgroundColor: C.blueSoft, borderLeftWidth: 2, borderLeftColor: C.blue },
  pillChase: { backgroundColor: "#FFF3E2", borderLeftWidth: 2, borderLeftColor: "#FFB86B" },
  pillText: { fontSize: 8.5, fontWeight: "600", color: C.ink },
  pillTextMine: { color: C.blue },
  pillTextChase: { color: "#8A5A12" },
  more: { fontSize: 9, color: C.faint, textAlign: "center" },
  list: { gap: 6 },
  rowItem: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  rowMine: { backgroundColor: C.blueSoft, borderLeftWidth: 3, borderLeftColor: C.blue },
  rowChase: { backgroundColor: "#FFF3E2", borderLeftWidth: 3, borderLeftColor: "#FFB86B" },
  time: { width: 58, fontSize: 12, fontWeight: "700", color: C.muted, paddingTop: 2 },
  timeMine: { color: C.blue },
  timeChase: { color: "#8A5A12" },
  itemTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "600", color: C.ink },
  itemTitleMine: { color: C.blue },
  itemTitleChase: { color: "#8A5A12" },
  note: { fontSize: 12, color: C.muted, marginTop: 2 },
  empty: { fontSize: 14, color: C.muted, paddingVertical: 8 },
});
