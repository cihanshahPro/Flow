import React from "react";
import { StyleSheet, Text, View } from "react-native";

const steps = [
  {
    title: "Set up",
    help: "Choose a starting direction. You can finish your profile later.",
  },
  {
    title: "Shape a plan",
    help: "Keep your thought, review its plan, and choose one step.",
  },
  {
    title: "Take a step",
    help: "One chosen action. Open it to change, reschedule, or mark it done.",
  },
  {
    title: "Check in",
    help: "Review what happened, then continue, wait, or pause here.",
  },
] as const;

/** A route through one planning cycle, not a percentage of someone's goal. */
export default function PathRail({
  stage,
  compact = false,
}: {
  stage: 0 | 1 | 2 | 3;
  compact?: boolean;
}) {
  return (
    <View style={s.rail}>
      <Text style={s.kicker}>YOUR PATH · {stage + 1} OF 4</Text>
      <View style={s.steps}>
        {steps.map((step, index) => (
          <View
            key={step.title}
            accessible
            accessibilityLabel={`${index + 1}. ${step.title}. ${index < stage ? "Passed in this cycle" : index === stage ? "You are here" : "Next"}.`}
            style={s.step}
          >
            <View style={s.lineRow}>
              <View
                style={[
                  s.dot,
                  index < stage && s.passedDot,
                  index === stage && s.activeDot,
                ]}
              >
                <Text style={[s.number, index <= stage && s.activeNumber]}>
                  {index < stage ? "✓" : index + 1}
                </Text>
              </View>
              {index < steps.length - 1 && (
                <View style={[s.line, index < stage && s.passedLine]} />
              )}
            </View>
            <Text style={[s.label, index === stage && s.activeLabel]}>
              {step.title}
            </Text>
          </View>
        ))}
      </View>
      {!compact && <Text style={s.help}>{steps[stage].help}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  rail: { gap: 12, paddingVertical: 12 },
  kicker: {
    color: "#68788C",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  steps: { flexDirection: "row" },
  step: { flex: 1, gap: 8 },
  lineRow: { flexDirection: "row", alignItems: "center" },
  dot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#E5EAF2",
    alignItems: "center",
    justifyContent: "center",
  },
  passedDot: { backgroundColor: "#788B6A" },
  activeDot: { backgroundColor: "#345BEE" },
  number: { fontSize: 11, color: "#68788C", fontWeight: "700" },
  activeNumber: { color: "#FFFFFF" },
  line: { height: 2, flex: 1, marginHorizontal: 5, backgroundColor: "#E5EAF2" },
  passedLine: { backgroundColor: "#C7D4BC" },
  label: { color: "#68788C", fontSize: 11, lineHeight: 16, paddingRight: 5 },
  activeLabel: { color: "#345BEE", fontWeight: "700" },
  help: { color: "#52647C", fontSize: 13, lineHeight: 20 },
});
