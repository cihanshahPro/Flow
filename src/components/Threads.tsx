import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Task } from "../model.ts";
import { pendingMessage, stageFor, threadGroup } from "../thread.ts";
import { C } from "./theme.ts";

/**
 * Every conversation with Flow, laid out like Messages: one row per thread,
 * the newest activity first, an unread dot when Flow is waiting on you.
 * Done and parked threads sink to the bottom, greyed. Nothing to learn.
 */
export default function Threads({
  threads,
  tasks,
  busy = false,
  onOpenThread,
  onNew,
  now = new Date(),
}: {
  threads: ThoughtDraft[];
  tasks: Task[];
  busy?: boolean;
  onOpenThread: (id: string) => void;
  onNew: () => void;
  now?: Date;
}) {
  const lastAt = (t: ThoughtDraft) => t.messages?.at(-1)?.createdAt ?? t.createdAt;
  const quiet = (t: ThoughtDraft) => threadGroup(t, tasks) === "done" || stageFor(t, tasks) === "parked";
  const visible = threads
    .filter((t) => !t.example)
    .sort((a, b) => Number(quiet(a)) - Number(quiet(b)) || lastAt(b).localeCompare(lastAt(a)));
  const open = visible.filter((t) => !quiet(t)).length;
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.brand}>Threads</Text>
        <Text style={s.count}>{open} open</Text>
      </View>
      <ScrollView contentContainerStyle={s.page}>
        {visible.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No threads yet.</Text>
            <Text style={s.body}>Record one thing that's on your mind and Flow will start the first one. Tap New thread below.</Text>
          </View>
        )}
        {visible.map((t, i) => {
          const pending = pendingMessage(t);
          const last = t.messages?.at(-1);
          const dim = quiet(t);
          const unread = !!pending && !dim;
          const preview = last ? (last.breakdown ? `You: ${last.breakdown.items.map((i) => i.title).join(" · ")}` : last.from === "you" ? `You: ${last.text}` : last.text) : t.source;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`Open thread ${t.title}`}
              onPress={() => onOpenThread(t.id)}
              disabled={busy}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.card }, dim && s.rowQuiet]}
            >
              <View style={s.dotCol}>{unread && <View style={s.dot} accessibilityLabel="Needs you" />}</View>
              <View style={[s.avatar, dim && s.avatarQuiet]}>
                <Text style={s.avatarText}>{initial(t.title)}</Text>
              </View>
              <View style={[s.cell, i < visible.length - 1 && s.separator]}>
                <View style={s.titleRow}>
                  <Text style={[s.title, unread && s.titleUnread]} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={s.time}>{dim ? (t.resolvedAt ? "Done" : "Parked") : stampLabel(lastAt(t), now)}</Text>
                </View>
                <Text style={[s.preview, unread && s.previewUnread]} numberOfLines={2}>
                  {preview}
                </Text>
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

function initial(title: string): string {
  const word = title.replace(/^(?:the|a|an|my|our)\s+/i, "").trim();
  return (word[0] ?? "•").toUpperCase();
}

/** Messages-style stamp: a time today, "Yesterday", a weekday this week, else a short date. */
export function stampLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 864e5);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, paddingRight: 84 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  count: { fontSize: 13, fontWeight: "700", color: C.muted },
  page: { paddingBottom: 24 },
  empty: { margin: 20, padding: 18, borderRadius: 18, backgroundColor: C.card, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 8 },
  rowQuiet: { opacity: 0.55 },
  dotCol: { width: 18, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.hero, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarQuiet: { backgroundColor: C.faint },
  avatarText: { color: C.white, fontSize: 19, fontWeight: "700" },
  cell: { flex: 1, paddingVertical: 12, paddingRight: 20, gap: 2 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: "600", color: C.ink },
  titleUnread: { fontWeight: "800" },
  time: { fontSize: 13, color: C.muted },
  preview: { fontSize: 15, lineHeight: 20, color: C.muted },
  previewUnread: { color: C.ink },
  footer: { paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 16 },
  recordIcon: { color: C.record, fontSize: 18 },
  recordText: { color: C.white, fontSize: 17, fontWeight: "700" },
});
