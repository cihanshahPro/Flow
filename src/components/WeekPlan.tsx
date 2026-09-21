import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { WeekPlan as Plan } from "../services/intake.ts";
import { DayList, WeekStrip } from "./Week.tsx";
import { localDate } from "../model.ts";
import { C } from "./theme.ts";

/**
 * After a dump: everything the person said, sorted and placed around what
 * their week already held. Ends with closure — the Record button is there,
 * but nothing is asked.
 */
export default function WeekPlan({ plan, busy = false, now = new Date(), onOpenProject, onRecord, onDone }: { plan: Plan; busy?: boolean; now?: Date; onOpenProject: (id: string) => void; onRecord: () => void; onDone: () => void }) {
  const [day, setDay] = useState<string>(localDate(now));
  const placed = plan.placements.filter((p) => p.slot || p.chaseDate);
  const later = plan.placements.filter((p) => p.item.kind === "later");
  const moved = plan.placements.filter((p) => p.note);
  const fresh = plan.projects.filter((p) => p.fresh);
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title}>Your week</Text>
        <Text style={s.sub}>from what you just said · {plan.placements.length} thing{plan.placements.length === 1 ? "" : "s"}, all placed</Text>
        <WeekStrip events={plan.events} tasks={plan.tasks} now={now} selected={day} onSelect={setDay} />
        <DayList events={plan.events} tasks={plan.tasks} date={day} />
        {moved.length > 0 && (
          <>
            <Text style={s.kicker}>PLACED AROUND YOUR WEEK</Text>
            {moved.map((p, i) => (
              <View key={i} style={s.item}>
                <Text style={s.itemTitle} numberOfLines={2}>
                  {p.item.title}
                </Text>
                <Text style={s.itemNote}>{p.note}</Text>
              </View>
            ))}
          </>
        )}
        {plan.placements.some((p) => p.item.kind === "waiting") && (
          <>
            <Text style={s.kicker}>WAITING ON</Text>
            {plan.placements
              .filter((p) => p.item.kind === "waiting")
              .map((p, i) => (
                <View key={i} style={[s.item, s.wait]}>
                  <Text style={s.itemTitle} numberOfLines={2}>
                    {p.item.person ?? p.item.project}: {p.item.title}
                  </Text>
                  <Text style={s.itemChase}>chase {p.chaseDate ? new Date(`${p.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "soon"}</Text>
                </View>
              ))}
          </>
        )}
        {later.length > 0 && (
          <>
            <Text style={s.kicker}>LATER</Text>
            {later.map((p, i) => (
              <View key={i} style={[s.item, s.later]}>
                <Text style={s.itemTitle} numberOfLines={2}>
                  {p.item.title}
                </Text>
              </View>
            ))}
          </>
        )}
        {fresh.length > 0 && (
          <>
            <Text style={s.kicker}>NEW THREADS · OPEN WHEN YOU WANT TO TALK</Text>
            {fresh.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Open thread ${p.title}`} onPress={() => onOpenProject(p.id)} disabled={busy} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
                <Text style={s.itemTitle} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={s.itemNote}>{p.area}</Text>
              </Pressable>
            ))}
          </>
        )}
        <View style={s.row}>
          <Text style={s.avatar}>f.</Text>
          <View style={[s.bubble, s.hype]}>
            <Text style={s.hypeText}>{plan.closure}</Text>
          </View>
        </View>
        {placed.length === 0 && plan.placements.length > 0 && <Text style={s.small}>Connect your calendar in Profile and Flow will put these on it.</Text>}
      </ScrollView>
      <View style={s.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Record" onPress={onRecord} disabled={busy} style={({ pressed }) => [s.record, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={s.recordIcon}>●</Text>
          <Text style={s.recordText}>Record</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Looks right" onPress={onDone} disabled={busy} hitSlop={8} style={{ alignSelf: "center" }}>
          <Text style={s.link}>Looks right</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 8 },
  title: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5, paddingHorizontal: 4 },
  sub: { fontSize: 13, color: C.muted, fontWeight: "600", paddingHorizontal: 4, marginBottom: 4 },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted, marginTop: 8 },
  item: { backgroundColor: C.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  wait: { backgroundColor: "#FFF3E2" },
  later: { opacity: 0.6 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  itemNote: { fontSize: 12, color: C.muted, fontWeight: "600" },
  itemChase: { fontSize: 12, color: "#8A5A12", fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.hero, color: C.white, textAlign: "center", lineHeight: 26, fontWeight: "800", fontSize: 12, overflow: "hidden" },
  bubble: { maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  hype: { backgroundColor: C.lime },
  hypeText: { fontSize: 16, lineHeight: 23, fontWeight: "700", color: C.onLime },
  small: { fontSize: 13, color: C.muted },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper, gap: 4 },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 16 },
  recordIcon: { color: C.record, fontSize: 18 },
  recordText: { color: C.white, fontSize: 17, fontWeight: "700" },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 6 },
});
