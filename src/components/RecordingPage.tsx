import React, { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Note, Task } from "../model.ts";
import { localDate } from "../model.ts";
import { AudioPlayback } from "./VoiceCapture.tsx";
import { Check, Dot, Empty, Row, Screen, Section, Segmented } from "./ui.tsx";
import { duration, recordingProjects, recordingTitle, stamp } from "./Recordings.tsx";
import { C } from "./theme.ts";

/**
 * Otter's conversation page for one recording: Summary (what Flow got, as
 * tickable rows, each ↗ to its sentence) and Transcript (the words, the
 * sentence behind each move highlighted, playback on top).
 */
export default function RecordingPage({
  note,
  threads,
  tasks,
  paragraph,
  now = new Date(),
  onBack,
  onTick,
  onOpenMove,
  onAsk,
}: {
  note: Note;
  threads: ThoughtDraft[];
  tasks: Task[];
  /** The model's sentences saying back the recording (from the intake record). */
  paragraph?: string;
  now?: Date;
  onBack: () => void;
  onTick: (task: Task) => void;
  onOpenMove: (task: Task) => void;
  /** Opens the project thread for a question about this recording. */
  onAsk?: (projectId: string) => void;
}) {
  const [tab, setTab] = useState("Summary");
  const [highlight, setHighlight] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const mine = tasks.filter((t) => t.noteId === note.id);
  const moves = mine.filter((t) => t.kind !== "waiting" && !t.later);
  const waiting = mine.filter((t) => t.kind === "waiting");
  const later = mine.filter((t) => t.later);
  const projects = recordingProjects(note, threads, tasks);
  const title = recordingTitle(note, threads, tasks);
  const today = localDate(now);
  const when = (t: Task) => (t.done ? "done" : t.kind === "waiting" ? (t.chaseDate ? `chase ${new Date(`${t.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}` : "waiting") : t.plannedDate ? `${t.plannedDate === today ? "Today" : new Date(`${t.plannedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}${t.plannedTime ? " " + t.plannedTime : ""}` : "");
  const jump = (t: Task) => {
    setHighlight(t.notes || null);
    setTab("Transcript");
  };
  const fallback = mine.length ? `${moves.length ? `${moves.length} move${moves.length === 1 ? "" : "s"}` : ""}${waiting.length ? `${moves.length ? ", " : ""}waiting on ${waiting.length}` : ""}${later.length ? `, ${later.length} for later` : ""}.` : "Nothing came of this yet.";
  // The transcript as paragraphs, with the sentence behind each move marked.
  const marks = mine.map((t) => (t.notes || "").trim()).filter((x) => x.length > 8);
  const paragraphs = note.text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).reduce<string[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.length < 260) acc[acc.length - 1] = `${last} ${s}`;
    else acc.push(s);
    return acc;
  }, []);
  const renderPara = (p: string, i: number) => {
    const parts: { text: string; hit: boolean; strong: boolean }[] = [];
    let rest = p;
    while (rest.length) {
      let best: { at: number; len: number } | null = null;
      for (const m of marks) {
        const at = rest.toLowerCase().indexOf(m.toLowerCase());
        if (at >= 0 && (!best || at < best.at)) best = { at, len: m.length };
      }
      if (!best) {
        parts.push({ text: rest, hit: false, strong: false });
        break;
      }
      if (best.at > 0) parts.push({ text: rest.slice(0, best.at), hit: false, strong: false });
      const hitText = rest.slice(best.at, best.at + best.len);
      parts.push({ text: hitText, hit: true, strong: !!highlight && hitText.toLowerCase() === highlight.toLowerCase() });
      rest = rest.slice(best.at + best.len);
    }
    return (
      <Text key={i} style={s.para}>
        {parts.map((x, k) => (
          <Text key={k} style={x.hit ? [s.mark, x.strong && s.markStrong] : undefined}>
            {x.text}
          </Text>
        ))}
      </Text>
    );
  };
  return (
    <Screen title={title} subtitle={`${stamp(note.createdAt, now)}${note.durationMs ? " · " + duration(note.durationMs) : ""}`} back="Recordings" onBack={onBack} scroll={false}>
      <Segmented items={["Summary", "Transcript"]} value={tab} onChange={setTab} />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 60 }}>
        {tab === "Summary" ? (
          <>
            <Text style={s.lead}>{paragraph?.trim() || fallback}</Text>
            {moves.length > 0 && (
              <Section label="Moves">
                {moves.map((t, i) => (
                  <Row key={t.id} first={i === 0} title={t.title} sub={when(t)} done={t.done} lead={<Check on={t.done} onPress={() => onTick(t)} />} trailing={<Text style={s.jump} onPress={() => jump(t)} accessibilityRole="button" accessibilityLabel={`Show where "${t.title}" came from`}>↗</Text>} onPress={() => onOpenMove(t)} accessibilityLabel={`Open move ${t.title}`} />
                ))}
              </Section>
            )}
            {waiting.length > 0 && (
              <Section label="Waiting on">
                {waiting.map((t, i) => (
                  <Row key={t.id} first={i === 0} title={`${t.waitingOn}: ${t.title}`} sub={when(t)} done={t.done} lead={<Dot color={C.amber} />} trailing={<Text style={s.jump} onPress={() => jump(t)} accessibilityRole="button" accessibilityLabel={`Show where "${t.title}" came from`}>↗</Text>} onPress={() => onOpenMove(t)} accessibilityLabel={`Open waiting ${t.title}`} />
                ))}
              </Section>
            )}
            {later.length > 0 && (
              <Section label="Later">
                {later.map((t, i) => (
                  <Row key={t.id} first={i === 0} title={t.title} lead={<Dot />} onPress={() => onOpenMove(t)} accessibilityLabel={`Open later ${t.title}`} />
                ))}
              </Section>
            )}
            {mine.length === 0 && <Empty text="Flow is still reading this, or nothing in it needed a move." />}
            {projects.length > 0 && onAsk && (
              <Section label="Ask Flow">
                {projects.map((p, i) => (
                  <Row key={p.id} first={i === 0} title={p.title} sub="talk it through" when="›" onPress={() => onAsk(p.id)} accessibilityLabel={`Ask Flow about ${p.title}`} />
                ))}
              </Section>
            )}
          </>
        ) : (
          <>
            {!!note.audioUri && (
              <View style={s.player}>
                <AudioPlayback uri={note.audioUri} />
              </View>
            )}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 10 }}>{paragraphs.map(renderPara)}</View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 15, lineHeight: 22, color: C.ink, paddingHorizontal: 20, paddingTop: 12 },
  jump: { color: C.accent, fontSize: 16, fontWeight: "700", paddingHorizontal: 4 },
  player: { marginHorizontal: 20, marginTop: 10, backgroundColor: C.tint, borderRadius: 12, padding: 8 },
  para: { fontSize: 15, lineHeight: 22, color: C.ink },
  mark: { backgroundColor: "#FFF3B0" },
  markStrong: { backgroundColor: "#FFE066" },
});
