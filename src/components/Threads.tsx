import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Note, Task } from "../model.ts";
import { pendingMessage, stageFor, threadGroup } from "../thread.ts";
import { duration, recordingResult, recordingTitle, stamp } from "./Recordings.tsx";
import { Empty, Fab, Ring, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/**
 * Threads, laid out like Messages: one row per project thread, newest
 * activity first, a dot when Flow is waiting on you; done and parked ones
 * sink, greyed. Under them, every recording as its own page. One Record
 * button.
 */
export default function Threads({
  threads,
  notes,
  tasks,
  busy = false,
  now = new Date(),
  onOpenThread,
  onOpenRecording,
  onRecord,
  onWrite,
}: {
  threads: ThoughtDraft[];
  notes: Note[];
  tasks: Task[];
  busy?: boolean;
  now?: Date;
  onOpenThread: (id: string) => void;
  onOpenRecording: (note: Note) => void;
  onRecord: () => void;
  onWrite: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const lastAt = (t: ThoughtDraft) => t.messages?.at(-1)?.createdAt ?? t.createdAt;
  const quiet = (t: ThoughtDraft) => threadGroup(t, tasks) === "done" || stageFor(t, tasks) === "parked";
  const visible = threads
    .filter((t) => !t.example)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || tasks.some((x) => x.projectId === t.id && x.title.toLowerCase().includes(q)))
    .sort((a, b) => Number(quiet(a)) - Number(quiet(b)) || lastAt(b).localeCompare(lastAt(a)));
  const open = visible.filter((t) => !quiet(t)).length;
  const recordings = notes
    .filter((n) => !n.planId && (!n.captureKind || n.captureKind === "thought") && n.text?.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((n) => !q || n.text.toLowerCase().includes(q) || recordingTitle(n, threads, tasks).toLowerCase().includes(q));
  return (
    <Screen title="Threads" subtitle={`${open} open`} fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}>
      <View style={s.searchWrap}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search threads and recordings" placeholderTextColor={C.ink3} accessibilityLabel="Search" style={s.search} clearButtonMode="while-editing" />
      </View>
      {visible.length === 0 && <Empty text={q ? "Nothing matches." : "No threads yet. Record what's on your mind and Flow starts them."} />}
      {visible.map((t, i) => {
        const pending = pendingMessage(t);
        const last = t.messages?.at(-1);
        const dim = quiet(t);
        const unread = !!pending && !dim;
        const mine = tasks.filter((x) => x.projectId === t.id);
        const done = mine.filter((x) => x.done).length;
        const preview = last ? (last.breakdown ? `You: ${last.breakdown.items.map((i) => i.title).join(" · ")}` : last.from === "you" ? `You: ${last.text}` : last.text) : t.source;
        return (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Open thread ${t.title}`} onPress={() => onOpenThread(t.id)} disabled={busy} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.tint }, dim && s.rowQuiet]}>
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
              {mine.length > 0 && (
                <View style={s.meta}>
                  <Ring done={done} total={mine.length} />
                  <Text style={s.metaText}>{mine.length - done ? `${mine.length - done} open` : "all done"}{t.area ? ` · ${t.area}` : ""}</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
      {recordings.length > 0 && (
        <Section label="Recordings" right={String(recordings.length)}>
          {recordings.map((n, i) => (
            <Row key={n.id} first={i === 0} title={recordingTitle(n, threads, tasks)} sub={`${recordingResult(n, tasks, threads)} · ${stamp(n.createdAt, now)}${n.durationMs ? " · " + duration(n.durationMs) : ""}`} when="›" onPress={() => onOpenRecording(n)} accessibilityLabel={`Open recording ${recordingTitle(n, threads, tasks)}`} />
          ))}
        </Section>
      )}
      <View style={{ height: 40 }} />
    </Screen>
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
  searchWrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 },
  search: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.ink },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 8 },
  rowQuiet: { opacity: 0.55 },
  dotCol: { width: 18, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentBg, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarQuiet: { backgroundColor: C.tint },
  avatarText: { color: C.accent, fontSize: 18, fontWeight: "700" },
  cell: { flex: 1, paddingVertical: 11, paddingRight: 20, gap: 2 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: "600", color: C.ink },
  titleUnread: { fontWeight: "800" },
  time: { fontSize: 12, color: C.ink2 },
  preview: { fontSize: 14, lineHeight: 19, color: C.ink2 },
  previewUnread: { color: C.ink },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 12, color: C.ink3, fontWeight: "500" },
});
