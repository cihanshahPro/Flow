import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme.ts";

/** Short lines that rotate while Flow shapes a thought. Calm, never a countdown. */
export const THINKING_LINES = ["Listening back…", "Finding the thread…", "Picking one next step…"] as const;
export const THINKING_LINE_MS = 2600;
export const thinkingLine = (tick: number): string => THINKING_LINES[Math.abs(tick) % THINKING_LINES.length];

/**
 * The "Flow is thinking" state: a soft breathing dot and rotating lines. It
 * never blocks: the person can leave (the thread appears when it is ready) or
 * stop waiting and take a basic draft.
 */
export default function Thinking({
  onBackground,
  onCancel,
  compact = false,
}: {
  /** Close the sheet and carry on; the result lands in the thread list. */
  onBackground?: () => void;
  /** Stop waiting for the AI and use the basic draft instead. */
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [tick, setTick] = useState(0);
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), THINKING_LINE_MS);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(timer);
      loop.stop();
    };
  }, [breathe]);
  return (
    <View style={[s.box, compact && { paddingVertical: 8 }]} accessibilityLabel="Flow is thinking" accessibilityLiveRegion="polite">
      <Animated.View
        style={[
          s.dot,
          { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }] },
        ]}
      />
      <Text style={s.line}>{thinkingLine(tick)}</Text>
      {!compact && <Text style={s.hint}>You don't have to wait here. It will be in your threads when it's ready.</Text>}
      {onBackground && (
        <Pressable accessibilityRole="button" accessibilityLabel="Keep going, I'll come back" onPress={onBackground} hitSlop={8}>
          <Text style={s.link}>Keep going — I'll come back</Text>
        </Pressable>
      )}
      {onCancel && (
        <Pressable accessibilityRole="button" accessibilityLabel="Use a basic draft instead" onPress={onCancel} hitSlop={8}>
          <Text style={s.muted}>Use a basic draft instead</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { alignItems: "center", gap: 12, paddingVertical: 20 },
  dot: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue },
  line: { fontSize: 18, fontWeight: "600", color: C.ink },
  hint: { fontSize: 14, lineHeight: 20, color: C.muted, textAlign: "center" },
  link: { color: C.blue, fontSize: 15, fontWeight: "600" },
  muted: { color: C.faint, fontSize: 13 },
});
