import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Task } from "../model.ts";
import { attentionLabel, clarity, pendingMessage, stageFor } from "../thread.ts";
import { C } from "./theme.ts";

/** Every conversation with Flow, like a chats list: needs-you first, then active, then parked and done. */
export default function Threads({
  threads,
  tasks,
  busy = false,
  onOpenThread,
  onNew,
}: {
  threads: ThoughtDraft[];
  tasks: Task[];
  busy?: boolean;
  onOpenThread: (id: string) => void;
  onNew: () => void;
}) {
  const lastAt = (t: ThoughtDraft) => t.messages?.at(-1)?.createdAt ?? t.createdAt;
  const rank = (t: ThoughtDraft) => {
    const stage = stageFor(t, tasks);
    if (pendingMessage(t) && stage !== "parked") return 0;
    if (stage === "moving" || stage === "understood" || stage === "dumped") return 1;
    if (stage === "parked") return 2;
    return 3;
  };
  const sorted = threads
    .filter((t) => !t.example)
    .sort((a, b) => rank(a) - rank(b) || lastAt(b).localeCompare(lastAt(a)));
  const open = sorted.filter((t) => rank(t) < 2).length;
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.brand}>Threads</Text>
        <Text style={s.count}>{open} open</Text>
      </View>
      <ScrollView contentContainerStyle={s.page}>
        {sorted.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No threads yet.</Text>
            <Text style={s.body}>Record one thing that's on your mind and Flow will start the first one.</Text>
          </View>
        )}
        {sorted.map((t) => {
          const meter = clarity(t.threadPoints);
          const pending = pendingMessage(t);
          const stage = stageFor(t, tasks);
          const quiet = stage === "parked" || stage === "done";
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`Open thread ${t.title}`}
              onPress={() => onOpenThread(t.id)}
              disabled={busy}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }, quiet && s.cardQuiet]}
            >
              <View style={s.cardRow}>
                <Text style={s.cardTitle} numberOfLines={2}>
                  {t.title}
                </Text>
                {pending && !quiet && <View style={s.dotBadge} accessibilityLabel="Needs you" />}
              </View>
              <Text style={[s.cardMeta, pending && !quiet && s.cardMetaLive]}>{attentionLabel(t, tasks)}</Text>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round((meter.known / meter.total) * 100)}%` }]} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="New thread" onPress={onNew} disabled={busy} style={({ pressed }) => [s.record, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={s.recordIcon}>●</Text>
          <Text style={s.recordText}>New thread</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  count: { fontSize: 13, fontWeight: "700", color: C.muted },
  page: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  empty: { padding: 18, borderRadius: 18, backgroundColor: C.white, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  card: { padding: 16, borderRadius: 18, backgroundColor: C.white, gap: 8 },
  cardQuiet: { opacity: 0.6 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "700", color: C.ink },
  cardMeta: { fontSize: 13, color: C.muted },
  cardMetaLive: { color: C.blue, fontWeight: "700" },
  dotBadge: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },
  footer: { paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 16 },
  recordIcon: { color: "#FF6B6B", fontSize: 18 },
  recordText: { color: C.white, fontSize: 17, fontWeight: "700" },
});
