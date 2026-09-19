import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import type { Task } from "../model.ts";
import { attentionLabel, clarity, pendingMessage, stageFor } from "../thread.ts";
import { C } from "./theme.ts";

/**
 * Home is one button and the threads Flow made. There is nothing to organise.
 */
export default function Home({
  threads,
  tasks,
  nextTask,
  nextThread,
  levelLabel,
  busy = false,
  notice = "",
  error = "",
  onRecord,
  onWrite,
  onOpenThread,
  onDoneNext,
  onCalendarNext,
  onOpenMe,
  onDismissNotice,
}: {
  threads: ThoughtDraft[];
  tasks: Task[];
  nextTask?: Task;
  nextThread?: ThoughtDraft;
  levelLabel: string;
  busy?: boolean;
  notice?: string;
  error?: string;
  onRecord: () => void;
  onWrite: () => void;
  onOpenThread: (id: string) => void;
  onDoneNext: () => void;
  onCalendarNext: () => void;
  onOpenMe: () => void;
  onDismissNotice: () => void;
}) {
  const visible = threads.filter((t) => !t.example);
  const lastAt = (t: ThoughtDraft) => t.messages?.at(-1)?.createdAt ?? t.createdAt;
  const sorted = [...visible].sort((a, b) => {
    const pa = pendingMessage(a) ? 1 : 0,
      pb = pendingMessage(b) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const sa = stageFor(a, tasks) === "parked" || stageFor(a, tasks) === "done" ? 1 : 0;
    const sb = stageFor(b, tasks) === "parked" || stageFor(b, tasks) === "done" ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return lastAt(b).localeCompare(lastAt(a));
  });
  const empty = sorted.length === 0;
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.brand}>
          flow<Text style={{ color: C.blue }}>.</Text>
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Me" onPress={onOpenMe} style={s.pill}>
          <Text style={s.pillText}>{levelLabel}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[s.page, empty && s.pageEmpty]} keyboardShouldPersistTaps="handled">
        {!!error && (
          <Pressable onPress={onDismissNotice} accessibilityRole="button" accessibilityLabel="Dismiss error">
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          </Pressable>
        )}
        {!!notice && (
          <Pressable onPress={onDismissNotice} accessibilityRole="button" accessibilityLabel="Dismiss status">
            <Text accessibilityLiveRegion="polite" style={s.notice}>
              {notice}
            </Text>
          </Pressable>
        )}
        {nextTask && (
          <View style={s.next}>
            <Text style={s.kicker}>NEXT</Text>
            <Text style={s.nextTitle}>{nextTask.title}</Text>
            {nextThread && (
              <Pressable accessibilityRole="button" accessibilityLabel="Open the thread for your next move" onPress={() => onOpenThread(nextThread.id)}>
                <Text style={s.nextThread}>from “{nextThread.title}”</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={onDoneNext}
              disabled={busy}
              style={({ pressed }) => [s.done, (pressed || busy) && { opacity: 0.6 }]}
            >
              <Text style={s.doneText}>Done ✓</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Put it on my calendar" onPress={onCalendarNext} disabled={busy} hitSlop={8}>
              <Text style={s.link}>Put it on my calendar</Text>
            </Pressable>
          </View>
        )}
        {empty ? (
          <View style={s.emptyBlock}>
            <Text style={s.headline}>What's on your mind?</Text>
            <Text style={s.body}>Record everything about one thing. Don't organise it — Flow will.</Text>
          </View>
        ) : (
          <Text style={s.headline}>What's on your mind?</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record"
          onPress={onRecord}
          disabled={busy}
          style={({ pressed }) => [s.record, (pressed || busy) && { opacity: 0.6 }]}
        >
          <Text style={s.recordIcon}>●</Text>
          <Text style={s.recordText}>Record</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Write instead" onPress={onWrite} disabled={busy} hitSlop={8}>
          <Text style={s.linkCenter}>or write it down</Text>
        </Pressable>
        {!empty && (
          <View style={s.threads}>
            <Text style={s.kicker}>YOUR THREADS</Text>
            {sorted.map((t) => {
              const meter = clarity(t.threadPoints);
              const pending = pendingMessage(t);
              const stage = stageFor(t, tasks);
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open thread ${t.title}`}
                  onPress={() => onOpenThread(t.id)}
                  disabled={busy}
                  style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }, (stage === "parked" || stage === "done") && s.cardQuiet]}
                >
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle} numberOfLines={2}>
                      {t.title}
                    </Text>
                    {pending && <View style={s.dotBadge} accessibilityLabel="Needs you" />}
                  </View>
                  <Text style={[s.cardMeta, pending && s.cardMetaLive]}>{attentionLabel(t, tasks)}</Text>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${Math.round((meter.known / meter.total) * 100)}%` }]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10 },
  brand: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, minHeight: 36, justifyContent: "center" },
  pillText: { fontSize: 13, fontWeight: "700", color: C.ink },
  page: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  pageEmpty: { flexGrow: 1, justifyContent: "center" },
  emptyBlock: { gap: 8, marginBottom: 8 },
  headline: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: C.ink, marginTop: 8 },
  body: { fontSize: 16, lineHeight: 23, color: C.muted },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 22, paddingVertical: 24 },
  recordIcon: { color: "#FF6B6B", fontSize: 20 },
  recordText: { color: C.white, fontSize: 20, fontWeight: "700" },
  link: { color: C.blue, fontSize: 14, fontWeight: "600", paddingVertical: 6 },
  linkCenter: { color: C.blue, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 6 },
  next: { padding: 18, borderRadius: 20, backgroundColor: C.ink, gap: 8 },
  nextTitle: { fontSize: 21, lineHeight: 27, fontWeight: "700", color: C.white },
  nextThread: { fontSize: 13, color: "#B9C3DD" },
  done: { backgroundColor: C.lime, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  doneText: { color: C.ink, fontSize: 16, fontWeight: "800" },
  threads: { gap: 10, marginTop: 10 },
  card: { padding: 16, borderRadius: 18, backgroundColor: C.white, gap: 8 },
  cardQuiet: { opacity: 0.7 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "700", color: C.ink },
  cardMeta: { fontSize: 13, color: C.muted },
  cardMetaLive: { color: C.blue, fontWeight: "700" },
  dotBadge: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: C.blue, borderRadius: 3 },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
  notice: { color: C.ink, fontSize: 14, lineHeight: 20, backgroundColor: C.lime, padding: 10, borderRadius: 12, overflow: "hidden" },
});
