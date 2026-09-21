import React, { useRef, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { C, T } from "./theme.ts";

/**
 * The four things every screen is made of — large title, section label,
 * row, one button — plus a segmented control and a bottom sheet. Nothing
 * else is allowed to invent a surface.
 */

export function Screen({ title, subtitle, back, onBack, right, children, scroll = true, fab, tabs, footer }: { title: string; subtitle?: string; back?: string; onBack?: () => void; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean; fab?: React.ReactNode; tabs?: React.ReactNode; /** Pinned under the body: the one button a screen ends with. */ footer?: React.ReactNode }) {
  const body = scroll ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[s.body, { flex: 1 }]}>{children}</View>;
  return (
    <View style={s.screen}>
      <View style={s.nav}>
        <View style={{ flex: 1 }}>
          {!!back && (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={10}>
              <Text style={s.back}>‹ {back}</Text>
            </Pressable>
          )}
          <Text style={[T.title, back ? { fontSize: 22, lineHeight: 26 } : null]} numberOfLines={back ? 2 : 1}>
            {title}
          </Text>
          {!!subtitle && <Text style={T.subtitle}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {body}
      {!!footer && <View style={s.footer}>{footer}</View>}
      {fab}
      {tabs}
    </View>
  );
}

export function Section({ label, right, children }: { label: string; right?: string; children?: React.ReactNode }) {
  return (
    <View>
      <View style={s.section}>
        <Text style={T.section}>{label.toUpperCase()}</Text>
        {!!right && <Text style={T.section}>{right}</Text>}
      </View>
      {children}
    </View>
  );
}

export type RowAction = { label: string; color?: string; onPress: () => void };

/**
 * A row: leading mark (checkbox, dot, ring), title + one line under it,
 * trailing text. Tap opens; swipe left reveals up to three actions.
 */
export function Row({
  title,
  sub,
  when,
  lead,
  trailing,
  onPress,
  onLongPress,
  actions,
  done = false,
  first = false,
  accessibilityLabel,
}: {
  title: string;
  sub?: string;
  when?: string;
  lead?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  actions?: RowAction[];
  done?: boolean;
  first?: boolean;
  accessibilityLabel?: string;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const width = (actions?.length ?? 0) * 64;
  const open = useRef(false);
  // Hidden actions stay out of VoiceOver's way until the row is swiped.
  const [revealed, setRevealed] = useState(false);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !!actions?.length && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = open.current ? -width : 0;
        x.setValue(Math.max(-width, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = open.current ? -width : 0;
        const to = base + g.dx < -width / 2 ? -width : 0;
        open.current = to !== 0;
        setRevealed(to !== 0);
        Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;
  const close = () => {
    open.current = false;
    setRevealed(false);
    Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };
  const content = (
    <Animated.View style={[s.row, !first && s.rowDivider, { transform: [{ translateX: x }] }]} {...(actions?.length ? pan.panHandlers : {})}>
      {lead}
      {/* The words are their own accessible element, so a checkbox or ↗ beside them stays reachable. */}
      <Pressable accessible accessibilityRole={onPress ? "button" : "text"} accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={{ flex: 1 }}>
        <Text style={[T.row, done && s.done]} numberOfLines={2}>
          {title}
        </Text>
        {!!sub && (
          <Text style={[T.sub, done && s.done]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </Pressable>
      {!!when && <Text style={[T.when, done && s.done]}>{when}</Text>}
      {trailing}
    </Animated.View>
  );
  return (
    <View style={s.rowWrap}>
      {!!actions?.length && (
        <View style={s.actions} accessibilityElementsHidden={!revealed} importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                close();
                a.onPress();
              }}
              style={[s.action, { backgroundColor: a.color ?? C.ink2 }]}
            >
              <Text style={s.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable accessible={false} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}>
        {content}
      </Pressable>
    </View>
  );
}

export function Check({ on = false, onPress, label }: { on?: boolean; onPress?: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label ?? (on ? "Done" : "Mark done")} onPress={onPress} hitSlop={10} style={[s.check, on && s.checkOn]}>
      {on && <Text style={s.checkMark}>✓</Text>}
    </Pressable>
  );
}

export function Dot({ color = C.ink3 }: { color?: string }) {
  return <View style={[s.dot, { backgroundColor: color }]} />;
}

/** Things' progress ring: done out of total. */
export function Ring({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(1, done / total) : 0;
  return (
    <View style={s.ring}>
      <View style={[s.ringFill, { transform: [{ rotate: `${-90 + pct * 360}deg` }], opacity: pct > 0 ? 1 : 0 }]} />
      {pct >= 1 && <View style={s.ringFull} />}
    </View>
  );
}

export function Pill({ text, tone = "amber" }: { text: string; tone?: "amber" | "red" | "blue" | "green" }) {
  const map = { amber: [C.amber, C.amberBg], red: [C.red, C.redBg], blue: [C.accent, C.accentBg], green: [C.green, C.greenBg] } as const;
  const [fg, bg] = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** The one button. Tap records; long-press types. */
export function Fab({ onRecord, onWrite, label = "Record", busy = false }: { onRecord: () => void; onWrite?: () => void; label?: string; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onRecord} onLongPress={onWrite} disabled={busy} style={({ pressed }) => [s.fab, (pressed || busy) && { opacity: 0.7 }]}>
      <View style={s.fabDot} />
      <Text style={s.fabText}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.segs}>
      {items.map((it) => (
        <Pressable key={it} accessibilityRole="tab" accessibilityState={{ selected: it === value }} accessibilityLabel={it} onPress={() => onChange(it)} style={[s.seg, it === value && s.segOn]}>
          <Text style={[s.segText, it === value && s.segTextOn]}>{it}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.dim} onPress={onClose} accessibilityLabel="Close sheet" />
      <View style={s.sheet}>
        <View style={s.grip} />
        {!!title && <Text style={s.sheetTitle}>{title}</Text>}
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function Chips({ items, value, onChange }: { items: string[]; value?: string; onChange: (v: string) => void }) {
  return (
    <View style={s.chips}>
      {items.map((it) => (
        <Pressable key={it} accessibilityRole="button" accessibilityLabel={it} accessibilityState={{ selected: it === value }} onPress={() => onChange(it)} style={[s.chip, it === value && s.chipOn]}>
          <Text style={[s.chipText, it === value && s.chipTextOn]}>{it}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${label}: ${value}`} onPress={onPress} disabled={!onPress} style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue} numberOfLines={1}>
        {value}
        {onPress ? " ›" : ""}
      </Text>
    </Pressable>
  );
}

export function Button({ label, onPress, busy = false, quiet = false, style }: { label: string; onPress: () => void; busy?: boolean; quiet?: boolean; style?: ViewStyle }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy} style={({ pressed }) => [quiet ? s.quiet : s.button, (pressed || busy) && { opacity: 0.6 }, style]}>
      <Text style={quiet ? s.quietText : s.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Para({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.para, style]}>
      <Text style={s.paraText}>{children}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function Notice({ text, onDismiss, tone = "green" }: { text: string; onDismiss?: () => void; tone?: "green" | "red" }) {
  return (
    <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={tone === "red" ? "Dismiss error" : "Dismiss status"} style={[s.notice, tone === "red" && { backgroundColor: C.redBg }]}>
      <Text style={[s.noticeText, tone === "red" && { color: C.red }]}>{text}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  nav: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  back: { color: C.accent, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  body: { paddingBottom: 120 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hair, backgroundColor: C.paper },
  section: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  rowWrap: { position: "relative", overflow: "hidden", backgroundColor: C.paper },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 9, minHeight: 46, backgroundColor: C.paper },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hair },
  done: { textDecorationLine: "line-through", color: C.ink3 },
  actions: { position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row" },
  action: { width: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  actionText: { color: C.white, fontSize: 11, fontWeight: "700", textAlign: "center" },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#C7CBD3", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: C.white, fontSize: 13, fontWeight: "800", lineHeight: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: C.hair, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  ringFill: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: C.accent, borderRightColor: "transparent", borderBottomColor: "transparent", left: -3, top: -3 },
  ringFull: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, left: -3, top: -3 },
  pill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "700" },
  fab: { position: "absolute", right: 18, bottom: 22, height: 52, borderRadius: 26, backgroundColor: C.accent, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 20, shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  fabDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.record },
  fabText: { color: C.white, fontSize: 15, fontWeight: "700" },
  segs: { flexDirection: "row", gap: 4, marginHorizontal: 20, marginTop: 6, backgroundColor: C.tint, borderRadius: 9, padding: 3 },
  seg: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segOn: { backgroundColor: C.white, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 12, fontWeight: "600", color: C.ink2 },
  segTextOn: { color: C.ink },
  dim: { flex: 1, backgroundColor: "rgba(17,24,39,0.25)" },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10, maxHeight: "82%" },
  grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D9DDE5", alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: C.ink, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.tint },
  chipOn: { backgroundColor: C.accent },
  chipText: { fontSize: 12, fontWeight: "600", color: C.ink },
  chipTextOn: { color: C.white },
  field: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  fieldLabel: { fontSize: 14, color: C.ink },
  fieldValue: { fontSize: 14, color: C.ink2, flexShrink: 1, textAlign: "right" },
  button: { marginTop: 12, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: C.white, fontSize: 15, fontWeight: "700" },
  quiet: { marginTop: 4, paddingVertical: 8, alignItems: "center" },
  quietText: { color: C.accent, fontSize: 14, fontWeight: "600" },
  para: { paddingHorizontal: 20, paddingTop: 8 },
  paraText: { fontSize: 14.5, lineHeight: 21, color: C.ink },
  empty: { paddingHorizontal: 20, paddingVertical: 14 },
  emptyText: { fontSize: 14, color: C.ink2 },
  notice: { marginHorizontal: 20, marginTop: 8, backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  noticeText: { color: C.green, fontSize: 13.5, fontWeight: "600" },
});
