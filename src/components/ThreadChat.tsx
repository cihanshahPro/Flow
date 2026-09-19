import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft, ThreadMessage } from "../drafts.ts";
import type { Note, Task } from "../model.ts";
import { celebrationEmoji, type Mode } from "../flow-voice.ts";
import { clarity, pendingMessage, stageFor, STAGE_LABEL, threadTasks } from "../thread.ts";
import { AudioPlayback } from "./VoiceCapture.tsx";
import EmojiRain from "./EmojiRain.tsx";
import { C } from "./theme.ts";

const rained = new Set<string>();

/**
 * One thread is one conversation with Flow. The person records, or taps one
 * of two chips. Flow does everything else.
 */
export default function ThreadChat({
  thread,
  tasks,
  notes,
  mode,
  busy = false,
  processing = false,
  onRecord,
  onWrite,
  onChip,
  onClose,
  error = "",
}: {
  thread: ThoughtDraft;
  tasks: Task[];
  notes: Note[];
  mode: Mode;
  busy?: boolean;
  processing?: boolean;
  onRecord: () => void;
  onWrite: () => void;
  onChip: (messageId: string, chipId: string) => void;
  onClose: () => void;
  error?: string;
}) {
  const messages = thread.messages ?? [];
  const pending = pendingMessage(thread);
  const meter = clarity(thread.threadPoints);
  const stage = stageFor(thread, tasks);
  const [showPoints, setShowPoints] = useState(false);
  const [rain, setRain] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const lastHype = [...messages].reverse().find((m) => m.kind === "hype");
  useEffect(() => {
    if (!lastHype || rained.has(lastHype.id)) return;
    const fresh = Date.now() - new Date(lastHype.createdAt).getTime() < 90_000;
    rained.add(lastHype.id);
    if (fresh) setRain(lastHype.id);
  }, [lastHype?.id]);
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, processing]);
  const moves = threadTasks(thread, tasks);
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close thread" onPress={onClose} disabled={busy} hitSlop={12} style={s.back}>
          <Text style={s.link}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>
            {thread.title}
          </Text>
          <Text style={s.stage}>{STAGE_LABEL[stage]}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Flow has ${meter.known} of ${meter.total} points`}
        onPress={() => setShowPoints((v) => !v)}
        style={s.meter}
      >
        <View style={s.meterRow}>
          <Text style={s.meterLabel}>WHAT FLOW HAS</Text>
          <Text style={s.meterCount}>
            {meter.known}/{meter.total}
          </Text>
        </View>
        <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: meter.total, now: meter.known }}>
          <View style={[s.fill, { width: `${Math.round((meter.known / meter.total) * 100)}%` }]} />
        </View>
        {showPoints && (
          <View style={{ gap: 6, marginTop: 8 }}>
            {(thread.threadPoints ?? []).map((p) => (
              <View key={p.id} style={s.point}>
                <Text style={[s.dot, p.state !== "known" && { color: C.faint }]}>{p.state === "known" ? "✓" : "·"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pointLabel}>{p.label}</Text>
                  {p.state === "known" && !!p.value && (
                    <Text style={s.pointValue} numberOfLines={2}>
                      “{p.value}”
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </Pressable>
      <ScrollView ref={scroll} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            note={m.noteId ? notes.find((n) => n.id === m.noteId) : undefined}
            task={m.taskId ? tasks.find((t) => t.id === m.taskId) : undefined}
            active={pending?.id === m.id}
            busy={busy}
            onChip={(chip) => onChip(m.id, chip)}
          />
        ))}
        {moves.length > 0 && (
          <View style={s.moves}>
            <Text style={s.meterLabel}>YOUR MOVES ON THIS</Text>
            {moves.map((t) => (
              <Text key={t.id} style={[s.move, t.done && s.moveDone]}>
                {t.done ? "✓ " : "· "}
                {t.title}
              </Text>
            ))}
          </View>
        )}
        {processing && (
          <View style={[s.bubble, s.flow, s.pendingBubble]}>
            <ActivityIndicator color={C.blue} />
            <Text style={s.flowText}>Listening back and thinking…</Text>
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
      </ScrollView>
      <View style={s.footer}>
        {pending?.kind === "question" && !processing && (
          <Text style={s.prompt}>Answer by recording. No need to organise it.</Text>
        )}
        {pending && pending.kind !== "question" && !processing && (
          <Text style={s.prompt}>Tap an option above, or add more by recording.</Text>
        )}
        {!pending && !processing && stage !== "done" && (
          <Text style={s.prompt}>Add anything new to this thread.</Text>
        )}
        {stage === "done" && !processing && <Text style={s.prompt}>This one's done. Record if something new comes up.</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record"
          onPress={onRecord}
          disabled={busy || processing}
          style={({ pressed }) => [s.record, (pressed || busy || processing) && { opacity: 0.6 }]}
        >
          <Text style={s.recordIcon}>●</Text>
          <Text style={s.recordText}>{pending?.kind === "question" ? "Record the answer" : "Record"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Write instead" onPress={onWrite} disabled={busy || processing} hitSlop={8}>
          <Text style={s.linkSmall}>or write it down</Text>
        </Pressable>
      </View>
      <EmojiRain emoji={celebrationEmoji(mode)} trigger={rain} onDone={() => setRain(null)} />
    </View>
  );
}

function Bubble({
  message,
  note,
  task,
  active,
  busy,
  onChip,
}: {
  message: ThreadMessage;
  note?: Note;
  task?: Task;
  active: boolean;
  busy: boolean;
  onChip: (chip: string) => void;
}) {
  const you = message.from === "you";
  const isHype = message.kind === "hype";
  const isOffer = message.kind === "offer";
  return (
    <View style={[s.row, you && s.rowYou]}>
      {!you && <Text style={s.avatar}>f.</Text>}
      <View style={[s.bubble, you ? s.you : s.flow, isHype && s.hype, isOffer && s.offer]}>
        {isOffer && <Text style={s.offerKicker}>A MOVE FOR THIS</Text>}
        <Text style={[you ? s.youText : s.flowText, isHype && s.hypeText, isOffer && s.offerText]}>{message.text}</Text>
        {message.kind === "transcript" && !!note?.audioUri && <AudioPlayback uri={note.audioUri} />}
        {message.kind === "checkin" && task && !message.answered && (
          <Text style={s.small}>Your move: {task.title}</Text>
        )}
        {message.kind === "question" && !message.answered && !!message.chips?.length && (
          <Text style={s.small}>Tap one, or record your own answer.</Text>
        )}
        {!!message.chips && !message.answered && (
          <View style={s.chips}>
            {message.chips.map((chip, i) => (
              <Pressable
                key={chip.id}
                accessibilityRole="button"
                accessibilityLabel={chip.label}
                onPress={() => onChip(chip.id)}
                disabled={busy || !active}
                style={({ pressed }) => [s.chip, i === 0 && message.kind !== "question" && s.chipPrimary, (pressed || busy) && { opacity: 0.6 }]}
              >
                <Text style={[s.chipText, i === 0 && message.kind !== "question" && s.chipPrimaryText]}>{chip.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, paddingRight: 64 },
  back: { paddingTop: 2 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "700", color: C.ink },
  stage: { fontSize: 13, fontWeight: "600", color: C.blue },
  link: { color: C.blue, fontSize: 16, fontWeight: "700", paddingVertical: 4 },
  linkSmall: { color: C.blue, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 8 },
  meter: { marginHorizontal: 20, marginBottom: 6, padding: 14, borderRadius: 16, backgroundColor: C.white, gap: 8 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meterLabel: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  meterCount: { fontSize: 13, fontWeight: "700", color: C.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 8, backgroundColor: C.blue, borderRadius: 4 },
  point: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  dot: { color: C.blue, fontWeight: "700", fontSize: 15, width: 14 },
  pointLabel: { fontSize: 13, fontWeight: "700", color: C.ink },
  pointValue: { fontSize: 12, lineHeight: 17, color: C.muted },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, paddingBottom: 24 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  rowYou: { justifyContent: "flex-end" },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.ink, color: C.white, textAlign: "center", lineHeight: 26, fontWeight: "800", fontSize: 12, overflow: "hidden" },
  bubble: { maxWidth: "82%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, gap: 8 },
  flow: { backgroundColor: C.flowBubble, borderBottomLeftRadius: 6 },
  you: { backgroundColor: C.youBubble, borderBottomRightRadius: 6 },
  flowText: { fontSize: 16, lineHeight: 22, color: C.ink },
  youText: { fontSize: 16, lineHeight: 22, color: C.white },
  hype: { backgroundColor: C.lime },
  hypeText: { fontSize: 18, lineHeight: 25, fontWeight: "700" },
  offer: { backgroundColor: C.blueSoft, borderWidth: 1, borderColor: "#D5DDFB" },
  offerKicker: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700", color: C.blue },
  offerText: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  pendingBubble: { flexDirection: "row", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", gap: 8, marginTop: 2, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  chipPrimary: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { fontSize: 14, fontWeight: "700", color: C.ink },
  chipPrimaryText: { color: C.white },
  small: { fontSize: 12, color: C.muted },
  moves: { padding: 14, borderRadius: 16, backgroundColor: C.white, gap: 6, marginTop: 6 },
  move: { fontSize: 14, color: C.ink },
  moveDone: { color: C.muted, textDecorationLine: "line-through" },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper },
  prompt: { fontSize: 13, color: C.muted, textAlign: "center" },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 16 },
  recordIcon: { color: "#FF6B6B", fontSize: 18 },
  recordText: { color: C.white, fontSize: 17, fontWeight: "700" },
  error: { color: C.red, fontSize: 14, lineHeight: 20, padding: 8 },
});
