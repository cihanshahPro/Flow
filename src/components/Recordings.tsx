import React, { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Note, Task } from "../model.ts";
import { Empty, Fab, Ring, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/** A recording as the list shows it: what was said, what came of it. */
export type RecordingRow = { note: Note; title: string; result: string; when: string; duration: string; hits?: number };

/** The projects a recording fed: by the thread's source notes, or by the moves it produced. */
export function recordingProjects(note: Note, threads: ThoughtDraft[], tasks: Task[] = []): ThoughtDraft[] {
  const viaTasks = new Set(tasks.filter((t) => t.noteId === note.id && t.projectId).map((t) => t.projectId));
  return threads.filter((t) => !t.example && (t.id === note.id || t.sourceNoteIds?.includes(note.id) || viaTasks.has(t.id)));
}

export function recordingTitle(note: Note, threads: ThoughtDraft[], tasks: Task[] = []): string {
  const mine = recordingProjects(note, threads, tasks);
  if (mine.length) return mine.map((t) => t.title).slice(0, 3).join(", ");
  const first = note.text.split(/(?<=[.!?])\s+/)[0] ?? note.text;
  return first.length > 48 ? first.slice(0, 47).trimEnd() + "…" : first;
}

export function recordingResult(note: Note, tasks: Task[]): string {
  const mine = tasks.filter((t) => t.noteId === note.id);
  const moves = mine.filter((t) => t.kind !== "waiting" && !t.later).length;
  const waiting = mine.filter((t) => t.kind === "waiting").length;
  const later = mine.filter((t) => t.later).length;
  const bits = [moves ? `${moves} move${moves === 1 ? "" : "s"}` : "", waiting ? `${waiting} waiting` : "", later ? `${later} later` : ""].filter(Boolean);
  return bits.join(" · ") || "noted";
}

export function stamp(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return t;
  if (days === 1) return `Yesterday ${t}`;
  if (days < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${t}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function duration(ms: number | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Voicenotes' list: title · result · when · how long. Search above.
 * Projects below with Things' progress ring.
 */
export default function Recordings({
  notes,
  threads,
  tasks,
  busy = false,
  now = new Date(),
  onOpenRecording,
  onOpenProject,
  onRecord,
  onWrite,
}: {
  notes: Note[];
  threads: ThoughtDraft[];
  tasks: Task[];
  busy?: boolean;
  now?: Date;
  onOpenRecording: (note: Note) => void;
  onOpenProject: (id: string) => void;
  onRecord: () => void;
  onWrite: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const recordings = notes
    .filter((n) => !n.planId && (!n.captureKind || n.captureKind === "thought") && n.text?.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((n) => !q || n.text.toLowerCase().includes(q) || tasks.some((t) => t.noteId === n.id && t.title.toLowerCase().includes(q)));
  const projects = threads
    .filter((t) => !t.example && t.state !== "parked")
    .map((t) => {
      const mine = tasks.filter((x) => x.projectId === t.id);
      return { t, open: mine.filter((x) => !x.done).length, done: mine.filter((x) => x.done).length, total: mine.length };
    })
    .filter((p) => !q || p.t.title.toLowerCase().includes(q))
    .sort((a, b) => Number(!!a.t.resolvedAt) - Number(!!b.t.resolvedAt) || b.open - a.open);
  return (
    <Screen title="Recordings" subtitle="everything you've said, sorted" fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}>
      <View style={s.searchWrap}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search recordings and moves" placeholderTextColor={C.ink3} accessibilityLabel="Search" style={s.search} clearButtonMode="while-editing" />
      </View>
      {recordings.length === 0 && <Empty text={q ? "Nothing matches." : "No recordings yet. Say what's on your mind."} />}
      {recordings.map((n, i) => (
        <Row key={n.id} first={i === 0} title={recordingTitle(n, threads, tasks)} sub={`${recordingResult(n, tasks)} · ${stamp(n.createdAt, now)}${n.durationMs ? " · " + duration(n.durationMs) : ""}`} when="›" onPress={() => onOpenRecording(n)} accessibilityLabel={`Open recording ${recordingTitle(n, threads, tasks)}`} />
      ))}
      {projects.length > 0 && (
        <Section label="Projects" right={String(projects.length)}>
          {projects.map((p, i) => (
            <Row
              key={p.t.id}
              first={i === 0}
              title={p.t.title}
              sub={p.t.resolvedAt ? "done" : p.total ? `${p.open} open${p.t.area ? " · " + p.t.area : ""}` : p.t.area ?? "no moves yet"}
              when="›"
              done={!!p.t.resolvedAt}
              lead={<Ring done={p.t.resolvedAt ? 1 : p.done} total={p.t.resolvedAt ? 1 : p.total} />}
              onPress={() => onOpenProject(p.t.id)}
              accessibilityLabel={`Open project ${p.t.title}`}
            />
          ))}
        </Section>
      )}
      <View style={{ height: 40 }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  searchWrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 },
  search: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.ink },
});
