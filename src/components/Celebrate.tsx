import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { C } from "./theme.ts";

/** A brief, quiet "done" pop. Re-runs whenever `pulse` changes; renders nothing before the first one. */
export default function Celebrate({ pulse, message }: { pulse: number; message: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    v.setValue(0);
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(1100),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [pulse, v]);
  if (!pulse) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[s.pop, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}
    >
      <Text style={s.text}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  pop: { alignSelf: "center", backgroundColor: C.lime, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  text: { color: C.onLime, fontWeight: "800", fontSize: 15 },
});
