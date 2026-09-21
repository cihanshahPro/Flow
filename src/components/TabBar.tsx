import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme.ts";

export type Tab = "today" | "upcoming" | "recordings" | "me";

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: "today", label: "Today", glyph: "◉" },
  { id: "upcoming", label: "Upcoming", glyph: "▦" },
  { id: "recordings", label: "Recordings", glyph: "≡" },
  { id: "me", label: "Me", glyph: "●" },
];

/** Four places, always visible. No badges: Today already says what needs you. */
export default function TabBar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <View style={s.bar} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => onSelect(t.id)} style={s.tab}>
            <Text style={[s.glyph, on && s.on]}>{t.glyph}</Text>
            <Text style={[s.label, on && s.on]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hair, backgroundColor: C.paper, paddingTop: 6, paddingBottom: 2 },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 46, justifyContent: "center" },
  glyph: { fontSize: 17, color: C.ink3 },
  label: { fontSize: 10.5, fontWeight: "600", color: C.ink3 },
  on: { color: C.accent, fontWeight: "700" },
});
