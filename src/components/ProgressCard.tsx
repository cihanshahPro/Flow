import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { levelForProgress, type ProgressRecord } from "../progress.ts";

export default function ProgressCard({
  progress,
}: {
  progress: ProgressRecord;
  busy?: boolean;
  onContinue?: () => void;
}) {
  const state = levelForProgress(progress);
  if (!state.unlocked || !state.level || !state.next) {
    return (
      <View style={[s.card, s.locked]}>
        <Text style={s.kicker}>YOUR PROGRESS</Text>
        <Text style={s.heading}>
          Levels unlock at 100% profile completion.
        </Text>
        <Text style={s.body}>
          Then, each completed action helps you reach your next level. Your
          existing completed actions will count too.
        </Text>
      </View>
    );
  }
  const { level, next, completedCount } = state;
  const levelLabel =
    level.title === `Level ${level.number}`
      ? `LEVEL ${level.number}`
      : `LEVEL ${level.number} · ${level.title.toUpperCase()}`;
  const nextLabel =
    next.title === `Level ${next.number}`
      ? `Level ${next.number}`
      : `Level ${next.number} — ${next.title}`;
  const remaining = `${next.remaining} more ${next.remaining === 1 ? "action" : "actions"} to ${nextLabel}.`;
  return (
    <View style={[s.card, s.unlocked]}>
      <Text style={s.kicker}>{levelLabel}</Text>
      <Text style={s.heading}>
        {completedCount} {completedCount === 1 ? "action" : "actions"} completed
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Completed actions toward Level ${next.number}`}
        accessibilityValue={{
          min: 0,
          max: next.threshold,
          now: completedCount,
          text: remaining,
        }}
        style={s.track}
      >
        <View
          style={[
            s.fill,
            { width: `${(completedCount / next.threshold) * 100}%` },
          ]}
        />
      </View>
      <Text style={s.body}>{remaining}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 22, borderRadius: 24, gap: 12 },
  locked: { backgroundColor: "#ECEFF2" },
  unlocked: { backgroundColor: "#E7EEDB" },
  kicker: {
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 1.2,
    fontWeight: "700",
    color: "#52647C",
  },
  heading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: "#142138",
  },
  body: { fontSize: 15, lineHeight: 23, color: "#52647C" },
  track: {
    height: 7,
    backgroundColor: "#CDD9BB",
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: { height: 7, backgroundColor: "#617C44" },
});
