import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { ThoughtDraft, ThreadMessage } from "../drafts.ts";
import type { Note, Task } from "../model.ts";
import { celebrationEmoji, type Mode } from "../flow-voice.ts";
import { clarity, pendingMessage, stageFor, STAGE_LABEL, threadTasks } from "../thread.ts";
import { AudioPlayback } from "./VoiceCapture.tsx";
import EmojiRain from "./EmojiRain.tsx";
import { C } from "./theme.ts";

const rained = new Set<string>();
const THINKING = ["Flow is reading that…", "Connecting it to what you said before…", "Working out the next question…", "Almost there…"];

/**
 * One thread is one conversation with Flow. A message bar at the bottom, the
 * person's words in full, Flow's replies on the left, two-chip decisions
 * inside Flow's bubbles. Nothing is truncated; long things expand.
 */
export default function ThreadChat({
  thread,
  tasks,
  notes,
  mode,
  busy = false,
  processing = false,
  onSend,
  onRecord,
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
  /** Typed message: saved and answered without leaving the chat. */
  onSend: (text: string) => void;
  /** Opens the recorder for this thread. */
  onRecord: () => void;
  onChip: (messageId: string, chipId: string) => void;
  onClose: () => void;
  error?: string;
}) {
  const messages = thread.messages ?? [];
  const pending = pendingMessage(thread);
  const meter = clarity(thread.threadPoints);
  const stage = stageFor(thread, tasks);
  const [showPoints, setShowPoints] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [rain, setRain] = useState<string | null>(null);
  const [thinkingIndex, setThinkingIndex] = useState(0);
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
  useEffect(() => {
    if (!processing) {
      setThinkingIndex(0);
      return;
    }
    const t = setInterval(() => setThinkingIndex((i) => (i + 1) % THINKING.length), 2200);
    return () => clearInterval(t);
  }, [processing]);
  const moves = threadTasks(thread, tasks);
  const canSend = draft.trim().length > 0 && !busy && !processing;
  const send = () => {
    const text = draft.trim();
    if (!text || busy || processing) return;
    setDraft("");
    onSend(text);
  };
  const placeholder =
    pending?.kind === "question" ? "Answer here, or tap a suggestion above" : stage === "done" ? "Anything new on this?" : "Message Flow";
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close thread" onPress={onClose} disabled={busy} hitSlop={12} style={s.back}>
          <Text style={s.link}>‹ Back</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Thread title" onPress={() => setTitleOpen((v) => !v)} style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={titleOpen ? undefined : 1}>
            {thread.title}
          </Text>
          <View style={s.subRow}>
            <Text style={s.stage}>{STAGE_LABEL[stage]}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Flow has ${meter.known} of ${meter.total} points`}
              onPress={() => setShowPoints((v) => !v)}
              hitSlop={8}
              style={s.meterChip}
            >
              <View style={s.miniTrack}>
                <View style={[s.miniFill, { width: `${Math.round((meter.known / meter.total) * 100)}%` }]} />
              </View>
              <Text style={s.meterCount}>
                {meter.known}/{meter.total} {showPoints ? "▾" : "▸"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
      {showPoints && (
        <View style={s.points}>
          <Text style={s.meterLabel}>WHAT FLOW HAS</Text>
          {(thread.threadPoints ?? []).map((p) => (
            <View key={p.id} style={s.point}>
              <Text style={[s.dot, p.state !== "known" && { color: C.faint }]}>{p.state === "known" ? "✓" : "·"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.pointLabel}>{p.label}</Text>
                {p.state === "known" && !!p.value && <Text style={s.pointValue}>“{p.value}”</Text>}
                {p.state !== "known" && <Text style={s.pointMissing}>not yet</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
      <ScrollView ref={scroll} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
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
          <View style={s.row}>
            <Text style={s.avatar}>f.</Text>
            <View style={[s.bubble, s.flow, s.pendingBubble]} accessibilityLiveRegion="polite">
              <ActivityIndicator color={C.blue} />
              <Text style={s.flowText}>{THINKING[thinkingIndex]}</Text>
            </View>
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
      </ScrollView>
      <View style={s.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record"
          onPress={onRecord}
          disabled={busy || processing}
          style={({ pressed }) => [s.mic, (pressed || busy || processing) && { opacity: 0.5 }]}
        >
          <Text style={s.micIcon}>●</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          multiline
          maxLength={20000}
          editable={!busy && !processing}
          accessibilityLabel="Message Flow"
          style={s.input}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={send}
          disabled={!canSend}
          style={({ pressed }) => [s.send, !canSend && s.sendOff, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.sendIcon}>↑</Text>
        </Pressable>
      </View>
      <EmojiRain emoji={celebrationEmoji(mode)} trigger={rain} onDone={() => setRain(null)} />
    </KeyboardAvoidingView>
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
  const isBranch = message.kind === "branch";
  const [expanded, setExpanded] = useState(false);
  const long = message.text.length > 700;
  return (
    <View style={[s.row, you && s.rowYou]}>
      {!you && <Text style={s.avatar}>f.</Text>}
      <View style={[s.bubble, you ? s.you : s.flow, isHype && s.hype, (isOffer || isBranch) && s.offer]}>
        {isOffer && <Text style={s.offerKicker}>A MOVE FOR THIS</Text>}
        {isBranch && <Text style={s.offerKicker}>MORE THAN ONE THING</Text>}
        <Text
          style={[you ? s.youText : s.flowText, isHype && s.hypeText, isOffer && s.offerText]}
          numberOfLines={long && !expanded ? 12 : undefined}
        >
          {message.text}
        </Text>
        {long && (
          <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Show less" : "Show more"} onPress={() => setExpanded((v) => !v)} hitSlop={8}>
            <Text style={[s.more, you && { color: C.white }]}>{expanded ? "Show less" : "Show more"}</Text>
          </Pressable>
        )}
        {message.kind === "transcript" && !!note?.audioUri && <AudioPlayback uri={note.audioUri} />}
        {message.kind === "checkin" && task && !message.answered && <Text style={s.small}>Your move: {task.title}</Text>}
        {message.kind === "question" && !message.answered && !!message.chips?.length && (
          <Text style={s.small}>Tap one, or just reply below.</Text>
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
  title: { fontSize: 20, lineHeight: 25, fontWeight: "700", color: C.ink },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  stage: { fontSize: 13, fontWeight: "600", color: C.blue },
  meterChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniTrack: { width: 56, height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  miniFill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },
  meterCount: { fontSize: 12, fontWeight: "700", color: C.muted },
  link: { color: C.blue, fontSize: 16, fontWeight: "700", paddingVertical: 4 },
  points: { marginHorizontal: 20, marginBottom: 6, padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 8 },
  meterLabel: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  point: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  dot: { color: C.blue, fontWeight: "700", fontSize: 15, width: 14 },
  pointLabel: { fontSize: 13, fontWeight: "700", color: C.ink },
  pointValue: { fontSize: 13, lineHeight: 18, color: C.muted },
  pointMissing: { fontSize: 12, color: C.faint },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10, paddingBottom: 16 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  rowYou: { justifyContent: "flex-end" },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.hero, color: C.white, textAlign: "center", lineHeight: 26, fontWeight: "800", fontSize: 12, overflow: "hidden" },
  bubble: { maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, gap: 8 },
  flow: { backgroundColor: C.flowBubble, borderBottomLeftRadius: 6 },
  you: { backgroundColor: C.youBubble, borderBottomRightRadius: 6 },
  flowText: { fontSize: 16, lineHeight: 23, color: C.ink },
  youText: { fontSize: 16, lineHeight: 23, color: C.white },
  more: { fontSize: 13, fontWeight: "700", color: C.blue },
  hype: { backgroundColor: C.lime },
  hypeText: { fontSize: 18, lineHeight: 25, fontWeight: "700", color: C.onLime },
  offer: { backgroundColor: C.blueSoft, borderWidth: 1, borderColor: C.blueLine },
  offerKicker: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700", color: C.blue },
  offerText: { fontSize: 17, lineHeight: 23, fontWeight: "700" },
  pendingBubble: { flexDirection: "row", alignItems: "center", gap: 10 },
  chips: { flexDirection: "row", gap: 8, marginTop: 2, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  chipPrimary: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { fontSize: 14, fontWeight: "700", color: C.ink },
  chipPrimaryText: { color: C.white },
  small: { fontSize: 12, color: C.muted },
  moves: { padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 6, marginTop: 6 },
  move: { fontSize: 14, color: C.ink },
  moveDone: { color: C.muted, textDecorationLine: "line-through" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper },
  mic: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  micIcon: { color: C.record, fontSize: 16 },
  input: { flex: 1, minHeight: 42, maxHeight: 140, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, fontSize: 16, lineHeight: 21, color: C.ink },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
  sendIcon: { color: C.white, fontSize: 20, fontWeight: "800" },
  error: { color: C.red, fontSize: 14, lineHeight: 20, padding: 8 },
});
