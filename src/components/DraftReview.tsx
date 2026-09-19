import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ThoughtDraft, DraftStep } from "../drafts";
import type { Task } from "../model.ts";
import { taskState } from "../task-flow.ts";
import PathRail from "./PathRail.tsx";

type Props = {
  presentation?: "small" | "sequence";
  draft: ThoughtDraft;
  tasks?: Task[];
  onOpenTask?: (task: Task) => void;
  busy: boolean;
  organizing: boolean;
  onChoose: (step: DraftStep, small: boolean) => void;
  onDefer: (step: DraftStep, defer: boolean) => void;
  onPark: () => void;
  onOrganize: () => void;
  onClose: () => void;
  error: string;
  notice: string;
};
function ChoiceButton({
  title,
  detail,
  primary = false,
  disabled = false,
  onPress,
}: {
  title: string;
  detail?: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.choice,
        primary && s.primary,
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Text style={[s.choiceTitle, primary && s.white]}>{title}</Text>
      {!!detail && (
        <Text style={[s.detail, primary && { color: "#E5EBFF" }]}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}
export default function DraftReview({
  presentation,
  draft,
  tasks = [],
  onOpenTask,
  busy,
  organizing,
  onChoose,
  onDefer,
  onPark,
  onOrganize,
  onClose,
  error,
  notice,
}: Props) {
  const available = draft.steps.filter((x) => !x.accepted && !x.deferred);
  const [focusedId, setFocusedId] = useState(
    available[0]?.id ?? draft.steps[0]?.id,
  );
  const [sourceOpen, setSourceOpen] = useState(false);
  const focused = draft.steps.find((x) => x.id === focusedId);
  const chosen = draft.steps.filter((x) => x.accepted).length;
  useEffect(() => {
    if (!focused || focused.accepted || focused.deferred)
      setFocusedId(available[0]?.id ?? focused?.id);
  }, [draft]);
  const locked = busy || organizing;
  const taskFor = (step: DraftStep) =>
    tasks.find((task) => task.id === `flow:${draft.id}:${step.id}`);
  const focusedTask = focused ? taskFor(focused) : undefined;
  const titleFor = (step: DraftStep) =>
    step.accepted
      ? (taskFor(step)?.title ?? step.chosenTitle ?? step.title)
      : (step.label ?? step.title);
  const stateLabel = (task?: Task) =>
    task
      ? {
          ready: "Ready to take",
          later: `Planned ${task.plannedDate}`,
          waiting: `Waiting · review ${task.chaseDate || "needed"}`,
          blocked: `Blocked · review ${task.chaseDate || "needed"}`,
          "check-in": "Finished · check in",
          done: "Finished",
        }[taskState(task)]
      : "Chosen step";
  return (
    <ScrollView contentContainerStyle={s.page}>
      <PathRail stage={1} compact />
      <Text style={s.eyebrow}>
        {presentation === "small"
          ? "ONE SMALL STEP IS ENOUGH"
          : "YOUR THOUGHT, TAKING SHAPE"}
      </Text>
      <Text style={s.heading}>{draft.title}</Text>
      <Text style={s.summary}>
        {draft.summary ??
          "Here are the next steps found in your words. Choose one, or leave everything for later."}
      </Text>
      {!draft.organizer && (
        <View style={s.organize}>
          <Text style={s.cardTitle}>Let Flow sort this out.</Text>
          <Text style={s.detail}>
            Get a short summary, distinct directions, and smaller first steps.
          </Text>
          <ChoiceButton
            title={organizing ? "Making sense of it…" : "Organize this thought"}
            primary
            disabled={locked}
            onPress={onOrganize}
          />
        </View>
      )}
      {organizing && <ActivityIndicator color="#345BEE" />}
      <View style={s.map}>
        <View style={s.root}>
          <View style={s.rootDot} />
          <Text style={s.rootText}>Your direction</Text>
          <Text style={s.count}>
            {chosen ? `${chosen} chosen` : "Nothing committed"}
          </Text>
        </View>
        <View style={s.stem}>
          {draft.steps.map((step, i) => (
            <View key={step.id} style={s.branch}>
              <View style={s.connector} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Explore ${titleFor(step)}`}
                accessibilityState={{ selected: focusedId === step.id }}
                onPress={() => setFocusedId(step.id)}
                style={[
                  s.node,
                  focusedId === step.id && s.nodeActive,
                  step.accepted && s.nodeChosen,
                ]}
              >
                <Text style={s.nodeNumber}>
                  {step.accepted
                    ? "✓"
                    : step.deferred
                      ? "◌"
                      : String(i + 1).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={s.nodeTitle}>
                    {titleFor(step)}
                  </Text>
                  <Text style={s.nodeStatus}>
                    {step.accepted
                      ? stateLabel(taskFor(step))
                      : step.deferred
                        ? "Kept for later"
                        : focusedId === step.id
                          ? "Exploring this direction"
                          : "A possibility"}
                  </Text>
                </View>
                <Text style={s.arrow}>{focusedId === step.id ? "↓" : "↗"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
      {focused && !focused.accepted && !focused.deferred ? (
        <View style={s.decision}>
          <Text style={s.eyebrow}>ONE SMALL DECISION</Text>
          <Text style={s.cardTitle}>How would you like to start?</Text>
          {!!focused.reason && <Text style={s.detail}>{focused.reason}</Text>}
          <ChoiceButton
            title="Choose this step"
            detail={focused.title}
            primary={presentation !== "small"}
            disabled={locked}
            onPress={() => onChoose(focused, false)}
          />
          {focused.smallAction?.toLowerCase() !==
            focused.title.toLowerCase() && (
            <ChoiceButton
              primary={presentation === "small"}
              title="Start smaller"
              detail={
                focused.smallAction ?? `Just five minutes on this direction`
              }
              disabled={locked}
              onPress={() => onChoose(focused, true)}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            disabled={locked}
            onPress={() => onDefer(focused, true)}
            style={s.linkButton}
          >
            <Text style={s.link}>Not now · keep it for later</Text>
          </Pressable>
        </View>
      ) : focused ? (
        <View style={s.decision}>
          <Text style={s.cardTitle}>
            {focused.accepted
              ? "A step you chose."
              : "Safe to leave for later."}
          </Text>
          <Text style={s.detail}>
            {focusedTask?.title ?? focused.chosenTitle ?? focused.title}
          </Text>
          {focusedTask && onOpenTask && (
            <ChoiceButton
              title="Open or edit this step"
              detail={stateLabel(focusedTask)}
              primary
              onPress={() => onOpenTask(focusedTask)}
              disabled={locked}
            />
          )}
          {!focused.accepted && (
            <ChoiceButton
              title="Bring this option back"
              disabled={locked}
              onPress={() => onDefer(focused, false)}
            />
          )}
        </View>
      ) : (
        <View style={s.decision}>
          <Text style={s.cardTitle}>This can simply be a thought.</Text>
          <Text style={s.detail}>
            You don’t have to turn every feeling or idea into a task.
          </Text>
        </View>
      )}
      {chosen > 0 && (
        <ChoiceButton
          title="That’s enough for now"
          detail={`${chosen} ${chosen === 1 ? "step" : "steps"} saved in your plan. Return to your path when ready.`}
          disabled={locked}
          onPress={onClose}
        />
      )}
      <Pressable
        accessibilityRole="button"
        disabled={locked}
        onPress={onPark}
        style={s.linkButton}
      >
        <Text style={s.link}>
          {draft.state === "parked"
            ? "Bring this thought back"
            : "Keep the whole thought for later"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show original words"
        accessibilityState={{ expanded: sourceOpen }}
        onPress={() => setSourceOpen(!sourceOpen)}
        style={s.linkButton}
      >
        <Text style={s.subtle}>
          {sourceOpen ? "Hide" : "Show"} original words{" "}
          {sourceOpen ? "−" : "＋"}
        </Text>
      </Pressable>
      {sourceOpen && (
        <View style={s.original}>
          <Text style={s.detail}>{draft.source}</Text>
          {draft.updates.map((u, i) => (
            <Text key={i} style={s.detail}>
              {u}
            </Text>
          ))}
        </View>
      )}
      <Text style={s.footnote}>
        {draft.organizer
          ? "Organized privately on your Mac mini. Suggestions stay possibilities until you choose."
          : draft.example
            ? "Example thought. Try the choices or organize it locally."
            : "Basic draft. Local AI organization is available above."}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { padding: 24, paddingBottom: 44, gap: 18 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: "#697386",
  },
  heading: {
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 35,
    color: "#142138",
  },
  summary: { fontSize: 16, lineHeight: 24, color: "#566278" },
  organize: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#EDF0FF",
    gap: 12,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
    color: "#142138",
  },
  detail: { fontSize: 14, lineHeight: 21, color: "#5F6B80" },
  map: { marginVertical: 4 },
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  rootDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#345BEE",
  },
  rootText: { fontSize: 14, fontWeight: "700", color: "#142138" },
  count: { marginLeft: "auto", fontSize: 11, color: "#697386" },
  stem: {
    marginLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: "#D9DFEC",
    paddingBottom: 4,
  },
  branch: { paddingLeft: 19, marginTop: 10 },
  connector: {
    position: "absolute",
    left: 0,
    top: 29,
    width: 19,
    height: 2,
    backgroundColor: "#D9DFEC",
  },
  node: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "#FFF",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E6ED",
  },
  nodeActive: { borderColor: "#345BEE", backgroundColor: "#EDF0FF" },
  nodeChosen: { backgroundColor: "#EFF6DD", borderColor: "#D5E6AF" },
  nodeNumber: { fontSize: 13, fontWeight: "800", color: "#345BEE" },
  nodeTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#142138",
  },
  nodeStatus: { fontSize: 11, color: "#697386", marginTop: 4 },
  arrow: { fontSize: 19, color: "#345BEE" },
  decision: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFF",
    gap: 13,
    borderWidth: 1,
    borderColor: "#E2E6ED",
  },
  choice: { padding: 16, borderRadius: 17, backgroundColor: "#F1F3F8", gap: 6 },
  primary: { backgroundColor: "#345BEE" },
  choiceTitle: { fontSize: 15, fontWeight: "700", color: "#142138" },
  white: { color: "#FFF" },
  linkButton: { paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  link: { fontSize: 14, fontWeight: "600", color: "#345BEE" },
  subtle: { fontSize: 13, color: "#697386" },
  original: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ECEFF5",
    gap: 10,
  },
  footnote: { fontSize: 11, lineHeight: 17, color: "#7B8495" },
  error: { color: "#B44343", fontSize: 14, lineHeight: 21 },
  notice: { color: "#345BEE", fontSize: 14, lineHeight: 21 },
});
