import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";

/**
 * A short burst of emoji falling over the chat when Flow gasses the user up.
 * Purely decorative; nothing is blocked and it removes itself.
 */
export default function EmojiRain({
  emoji,
  trigger,
  onDone,
}: {
  emoji: string[];
  trigger: string | null;
  onDone?: () => void;
}) {
  const drops = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        key: `${trigger}-${i}`,
        symbol: emoji[i % emoji.length],
        x: Math.random(),
        delay: Math.random() * 500,
        size: 22 + Math.round(Math.random() * 14),
        value: new Animated.Value(0),
      })),
    // A new trigger produces a new shower.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger],
  );
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!trigger) return;
    const animations = drops.map((d) =>
      Animated.timing(d.value, {
        toValue: 1,
        duration: 1800,
        delay: d.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const run = Animated.parallel(animations);
    run.start(() => done.current?.());
    return () => run.stop();
  }, [trigger, drops]);
  if (!trigger) return null;
  const height = Dimensions.get("window").height;
  const width = Dimensions.get("window").width;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {drops.map((d) => (
        <Animated.Text
          key={d.key}
          style={{
            position: "absolute",
            left: d.x * (width - 40),
            top: -40,
            fontSize: d.size,
            opacity: d.value.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: d.value.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { rotate: d.value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${d.x > 0.5 ? 40 : -40}deg`] }) },
            ],
          }}
        >
          {d.symbol}
        </Animated.Text>
      ))}
      <Text style={{ height: 0 }} />
    </View>
  );
}
