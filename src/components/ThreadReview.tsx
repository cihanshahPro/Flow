import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import PathRail from "./PathRail.tsx";

const labels: Record<string, string> = {
  dumped: "Saved dump",
  understanding: "Flow is understanding this",
  ready: "Ready to develop",
  active: "In progress",
  paused: "Saved for later",
  complete: "Thread complete",
};

export default function ThreadReview({
  draft,
  onCapture,
  onDevelop,
  onClose,
  busy = false,
}: {
  draft: ThoughtDraft;
  onCapture: () => void;
  onDevelop: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const status = draft.threadStatus ?? "dumped";
  const missing = draft.missingPoints ?? [];
  const points = draft.threadPoints ?? [];
  const ready = draft.goalsReady === true || status === "ready" || status === "active";
  return (
    <ScrollView contentContainerStyle={s.page}>
      <PathRail stage={1} compact />
      <View style={s.header}>
        <Text style={s.eyebrow}>MY MIND · THREAD</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close thread" onPress={onClose} disabled={busy}>
          <Text style={s.link}>Done</Text>
        </Pressable>
      </View>
      <Text style={s.title}>{draft.title}</Text>
      <Text style={s.status}>{labels[status]}</Text>
      <Text style={s.summary}>{draft.summary ?? "Your recording is saved. Flow will keep it here while it learns what this thread is about."}</Text>
      <View style={s.card}>
        <Text style={s.eyebrow}>WHAT FLOW HAS</Text>
        <Text style={s.body}>{draft.source}</Text>
        {points.map((point) => (
          <View key={point.id} style={s.point}>
            <Text style={s.dot}>{point.state === "known" ? "✓" : "·"}</Text>
            <View style={{ flex: 1 }}><Text style={s.pointLabel}>{point.label}</Text>{!!point.value && <Text style={s.detail}>{point.value}</Text>}</View>
          </View>
        ))}
        {!points.length && <Text style={s.detail}>The first recording is the starting point. Nothing else needs to be entered right now.</Text>}
      </View>
      {!!missing.length && <View style={s.card}><Text style={s.eyebrow}>STILL UNCLEAR</Text>{missing.slice(0, 1).map((item) => <Text key={item} style={s.body}>{item}</Text>)}<Text style={s.detail}>Record another thought whenever you are ready. Flow will keep the thread together.</Text></View>}
      <Pressable accessibilityRole="button" accessibilityLabel="Add to this thread" onPress={onCapture} disabled={busy} style={s.secondary}><Text style={s.buttonText}>Add another recording</Text><Text style={s.detail}>Continue this thread in your own words.</Text></Pressable>
      {ready && <Pressable accessibilityRole="button" accessibilityLabel="Develop this thread into goals" onPress={onDevelop} disabled={busy} style={s.primary}><Text style={s.primaryText}>Develop this thread into goals</Text><Text style={s.primaryDetail}>Flow will suggest a few smaller goals only after the thread is ready.</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Keep this thread for later" onPress={onClose} disabled={busy}><Text style={s.link}>Keep this thread for later</Text></Pressable>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { padding: 24, gap: 16, paddingBottom: 60, backgroundColor: "#F7F8FA" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: "700", color: "#60708A" },
  title: { fontSize: 34, lineHeight: 39, fontWeight: "700", color: "#142138" },
  status: { fontSize: 14, fontWeight: "700", color: "#345BEE" },
  summary: { fontSize: 16, lineHeight: 24, color: "#52647C" },
  card: { padding: 18, borderRadius: 20, backgroundColor: "#FFFFFF", gap: 12 },
  body: { fontSize: 16, lineHeight: 24, color: "#142138" },
  detail: { fontSize: 13, lineHeight: 20, color: "#68788C" },
  point: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { color: "#345BEE", fontSize: 18, fontWeight: "700" },
  pointLabel: { color: "#142138", fontWeight: "700" },
  secondary: { padding: 18, borderRadius: 18, backgroundColor: "#E9EEF7", gap: 5 },
  primary: { padding: 18, borderRadius: 18, backgroundColor: "#345BEE", gap: 5 },
  buttonText: { color: "#142138", fontSize: 16, fontWeight: "700" },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  primaryDetail: { color: "#E8EDFF", fontSize: 13, lineHeight: 19 },
  link: { color: "#345BEE", fontSize: 15, fontWeight: "700" },
});
