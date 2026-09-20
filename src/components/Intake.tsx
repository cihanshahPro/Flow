import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThoughtDraft } from "../drafts.ts";
import { C } from "./theme.ts";

/**
 * After a dump about several things: Flow shows it caught all of them and
 * sorted them into thread starters, then — only then — asks for more.
 * One button; a quiet way out. Nothing to decide.
 */
export default function Intake({
  drafts,
  busy = false,
  onOpen,
  onMore,
  onDone,
  now = new Date(),
}: {
  drafts: ThoughtDraft[];
  busy?: boolean;
  onOpen: (id: string) => void;
  onMore: () => void;
  onDone: () => void;
  now?: Date;
}) {
  const dated = drafts.filter((d) => d.dueHints?.length).length;
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title}>Off your chest</Text>
        <View style={s.row}>
          <Text style={s.avatar}>f.</Text>
          <View style={[s.bubble, s.hype]}>
            <Text style={s.hypeText}>
              ✅ Got all of it. I heard {drafts.length} things and started a thread for each.
            </Text>
          </View>
        </View>
        <View style={s.row}>
          <Text style={s.avatar}>f.</Text>
          <View style={[s.bubble, s.flow, { flex: 1 }]}>
            {drafts.map((d) => {
              const when = nearest(d, now);
              return (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open thread ${d.title}`}
                  onPress={() => onOpen(d.id)}
                  disabled={busy}
                  style={({ pressed }) => [s.starter, pressed && { opacity: 0.7 }]}
                >
                  <Text style={s.starterTitle} numberOfLines={2}>
                    {d.title}
                  </Text>
                  {!!when && <Text style={s.when}>{when}</Text>}
                </Pressable>
              );
            })}
            <Text style={s.small}>
              {dated ? `${dated === 1 ? "One has" : `${dated} have`} a date — I'll keep an eye on ${dated === 1 ? "it" : "them"}. ` : ""}
              Open any one when you're ready; I'll ask what I need there.
            </Text>
          </View>
        </View>
        <View style={s.row}>
          <Text style={s.avatar}>f.</Text>
          <View style={[s.bubble, s.flow]}>
            <Text style={s.flowText}>And what else?</Text>
          </View>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Record more" onPress={onMore} disabled={busy} style={({ pressed }) => [s.record, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={s.recordIcon}>●</Text>
          <Text style={s.recordText}>Record more</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="That's all for now" onPress={onDone} disabled={busy} hitSlop={8} style={{ alignSelf: "center" }}>
          <Text style={s.link}>That's all for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The nearest date the person mentioned for this thread, as they said it. */
function nearest(d: ThoughtDraft, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const hint = (d.dueHints ?? []).filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!hint) return "";
  const phrase = hint.phrase.replace(/^(this|next) /, "");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  title: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: -0.5, paddingHorizontal: 4, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.hero, color: C.white, textAlign: "center", lineHeight: 26, fontWeight: "800", fontSize: 12, overflow: "hidden" },
  bubble: { maxWidth: "88%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, gap: 8 },
  flow: { backgroundColor: C.flowBubble, borderBottomLeftRadius: 6 },
  flowText: { fontSize: 16, lineHeight: 23, color: C.ink },
  hype: { backgroundColor: C.lime },
  hypeText: { fontSize: 18, lineHeight: 25, fontWeight: "700", color: C.onLime },
  starter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  starterTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  when: { fontSize: 12, fontWeight: "700", color: C.blue },
  small: { fontSize: 13, lineHeight: 18, color: C.muted },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper, gap: 4 },
  record: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: C.blue, borderRadius: 18, paddingVertical: 16 },
  recordIcon: { color: C.record, fontSize: 18 },
  recordText: { color: C.white, fontSize: 17, fontWeight: "700" },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 6 },
});
