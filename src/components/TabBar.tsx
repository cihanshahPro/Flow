import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme.ts";

export type Tab = "today" | "threads" | "progress" | "profile";

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: "today", label: "Today", glyph: "◉" },
  { id: "threads", label: "Threads", glyph: "≡" },
  { id: "progress", label: "Progress", glyph: "▲" },
  { id: "profile", label: "Profile", glyph: "●" },
];

/** Four places, always visible after the funnel. A badge on Threads counts what needs you. */
export default function TabBar({ active, badge = 0, onSelect }: { active: Tab; badge?: number; onSelect: (tab: Tab) => void }) {
  return (
    <View style={s.bar} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(t.id)}
            style={s.tab}
          >
            <View>
              <Text style={[s.glyph, on && s.on]}>{t.glyph}</Text>
              {t.id === "threads" && badge > 0 && (
                <View style={s.badge} accessibilityLabel={`${badge} need you`}>
                  <Text style={s.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[s.label, on && s.on]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 48, justifyContent: "center" },
  glyph: { fontSize: 18, color: C.faint },
  label: { fontSize: 11, fontWeight: "600", color: C.muted },
  on: { color: C.blue, fontWeight: "800" },
  badge: { position: "absolute", top: -4, right: -12, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: C.white, fontSize: 10, fontWeight: "800" },
});
