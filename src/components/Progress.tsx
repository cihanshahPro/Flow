import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft, ThreadMessage } from "../drafts.ts";
import { levelForProgress, type ProgressRecord } from "../progress.ts";
import { repeatedPattern } from "../thread.ts";
import { C } from "./theme.ts";

/** The ladder, what counts, and Flow's recent gas-ups. Nothing expires. */
export default function Progress({ progress, threads, streak = 0 }: { progress: ProgressRecord; threads: ThoughtDraft[]; streak?: number }) {
  const level = levelForProgress(progress);
  const real = threads.filter((t) => !t.example);
  const pattern = repeatedPattern(real);
  const patternsUnlocked = (level.level?.number ?? 0) >= 3;
  const lately: { m: ThreadMessage; thread: ThoughtDraft }[] = real
    .flatMap((thread) => (thread.messages ?? []).filter((m) => m.kind === "hype").map((m) => ({ m, thread })))
    .sort((a, b) => b.m.createdAt.localeCompare(a.m.createdAt))
    .slice(0, 6);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Text style={s.brand}>Progress</Text>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>YOUR LEVEL</Text>
        {level.unlocked && level.level && level.next ? (
          <>
            <Text style={s.title}>{level.level.title}</Text>
            <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: level.next.threshold, now: level.completedCount }}>
              <View style={[s.fill, { width: `${Math.min(100, Math.round((level.completedCount / level.next.threshold) * 100))}%` }]} />
            </View>
            <Text style={s.body}>
              {level.next.remaining} more to {level.next.title}. No streaks, nothing expires.
            </Text>
          </>
        ) : (
          <Text style={s.body}>Levels start once you've done the test.</Text>
        )}
      </View>
      <View style={s.stats}>
        <Stat n={streak} label={streak === 1 ? "day in a row" : "days in a row"} />
        <Stat n={level.movesDone} label="moves done" />
        <Stat n={level.threadsUnderstood} label="threads understood" />
        <Stat n={level.checkIns} label="check-ins kept" />
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>THE LADDER</Text>
        {level.milestones.map((m) => {
          const current = level.level?.number === m.number;
          return (
            <View key={m.number} style={s.rung}>
              <Text style={[s.rungMark, m.reached && { color: C.blue }]}>{m.reached ? "✓" : "·"}</Text>
              <Text style={[s.rungTitle, current && { color: C.blue }]}>{m.title}</Text>
              <Text style={s.rungMeta}>{m.threshold === 0 ? "start" : `${m.threshold}`}</Text>
            </View>
          );
        })}
        <Text style={s.small}>What counts: a move you finish, a thread Flow understands, a check-in you confirm. Recording alone earns nothing.</Text>
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
      {lately.length > 0 && (
        <View style={s.card}>
          <Text style={s.kicker}>LATELY</Text>
          {lately.map(({ m, thread }) => (
            <View key={m.id} style={s.hype}>
              <Text style={s.hypeText}>{m.text}</Text>
              <Text style={s.small}>in “{thread.title}”</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 32, gap: 12, backgroundColor: C.paper },
  header: { paddingVertical: 4 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  card: { padding: 18, borderRadius: 20, backgroundColor: C.white, gap: 10 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  bodyStrong: { fontSize: 15, lineHeight: 22, color: C.ink, fontWeight: "600" },
  small: { fontSize: 12, lineHeight: 17, color: C.faint },
  track: { height: 10, borderRadius: 5, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 10, backgroundColor: C.blue, borderRadius: 5 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: C.white, gap: 2 },
  statN: { fontSize: 26, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 12, color: C.muted },
  rung: { flexDirection: "row", alignItems: "center", gap: 10 },
  rungMark: { width: 16, fontWeight: "800", color: C.faint },
  rungTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  rungMeta: { fontSize: 12, color: C.faint },
  hype: { padding: 10, borderRadius: 12, backgroundColor: C.lime, gap: 2 },
  hypeText: { fontSize: 15, fontWeight: "700", color: "#142138" },
});
