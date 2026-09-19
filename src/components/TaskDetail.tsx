import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { localDate, validDate, validateTask, type Task } from "../model.ts";
import {
  holdTask,
  postponeTask,
  resumeTask,
  taskIsDue,
  taskState,
} from "../task-flow.ts";
import PathRail from "./PathRail.tsx";

type Props = {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => Promise<void>;
  onComplete: (task: Task) => Promise<void>;
  onCalendar: (task: Task) => Promise<string | void>;
};
type Mode = "ready" | "later" | "waiting" | "blocked";

function after(days: number): string {
  const result = new Date();
  result.setDate(result.getDate() + days);
  return localDate(result);
}

function Button({
  label,
  onPress,
  disabled,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, primary && s.primary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, primary && s.white]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={!disabled}
        onChangeText={(next) => {
          if (!disabled) onChange(next);
        }}
        multiline={multiline}
        style={[s.input, multiline && s.multiline]}
      />
    </View>
  );
}

export default function TaskDetail({
  task,
  onClose,
  onSave,
  onComplete,
  onCalendar,
}: Props) {
  const [draft, setDraft] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [customDate, setCustomDate] = useState(false);
  const [mode, setMode] = useState<Mode>("ready");
  const [reviewDate, setReviewDate] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const opening = useRef<Task | null>(null);
  const editedTime = useRef(false);

  useEffect(() => {
    opening.current = task;
    editedTime.current = false;
    setDraft(task ? { ...task } : null);
    const state = task ? taskState(task) : "ready";
    setMode(
      state === "later" || state === "waiting" || state === "blocked"
        ? state
        : "ready",
    );
    setReviewDate(
      task
        ? state === "waiting" || state === "blocked"
          ? task.chaseDate
          : task.plannedDate
        : "",
    );
    setMinutes(task ? String(task.minutes) : "");
    setEditing(false);
    setDetails(false);
    setCustomDate(false);
    setError("");
    setNotice("");
  }, [task?.id, !!task]);

  if (!task || !draft) return null;
  const original = opening.current ?? task;
  const state = taskState(original);
  const initialMode = ["later", "waiting", "blocked"].includes(state)
    ? state
    : "ready";
  const initialDate =
    state === "waiting" || state === "blocked"
      ? original.chaseDate
      : original.plannedDate;
  const changed =
    JSON.stringify(draft) !== JSON.stringify(original) ||
    minutes !== String(original.minutes) ||
    mode !== initialMode ||
    reviewDate !== initialDate;
  const change = (patch: Partial<Task>) => setDraft({ ...draft, ...patch });

  function prepared(forCompletion = false): Task {
    let result = {
      ...draft!,
      title: draft!.title.trim(),
      minutes: Number(minutes),
    };
    if (!result.done) {
      if (mode === "waiting" || mode === "blocked") {
        // Finishing an old waiting item does not require inventing a new review date.
        if (reviewDate) result = holdTask(result, mode, reviewDate);
        else if (!forCompletion)
          throw new Error("Choose when to check back on this step.");
      } else if (mode === "later") {
        // Keep an existing time when only wording changes; moving dates clears it.
        if (mode !== initialMode || reviewDate !== original.plannedDate) {
          result = postponeTask(result, reviewDate);
          if (editedTime.current || draft!.plannedTime !== original.plannedTime)
            result.plannedTime = draft!.plannedTime;
        }
      }
    }
    validateTask(result);
    return result;
  }

  async function commit(action: "save" | "complete" | "calendar") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = prepared(action === "complete");
      if (action === "complete") await onComplete(result);
      else if (action === "calendar") {
        if (changed) await onSave(result);
        const message = await onCalendar(result);
        if (typeof message === "string") {
          setNotice(message);
          return;
        }
      } else await onSave(result);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This step could not be saved. Your changes are still here.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function chooseMode(value: Mode) {
    setMode(value);
    setCustomDate(false);
    editedTime.current = false;
    if (value === "later")
      setReviewDate(
        original.plannedDate > localDate() ? original.plannedDate : after(1),
      );
    else if (value === "waiting" || value === "blocked")
      setReviewDate(
        original.chaseDate > localDate() ? original.chaseDate : after(1),
      );
    else {
      const resumed = resumeTask(draft!);
      setReviewDate(resumed.plannedDate);
      setDraft(resumed);
    }
  }

  const status =
    state === "check-in" || state === "done"
      ? "Completed step"
      : state === "later"
        ? `Planned for ${original.plannedDate}`
        : state === "waiting" || state === "blocked"
          ? `${state === "waiting" ? "Waiting" : "Blocked"}${taskIsDue(original) ? " · follow-up due" : original.chaseDate ? ` · review ${original.chaseDate}` : " · choose a review date"}`
          : "Your next action";

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => !busy && onClose()}
    >
      <SafeAreaView style={s.shell} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={s.grow}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Text style={s.eyebrow}>YOUR STEP</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close step"
              disabled={busy}
              onPress={onClose}
            >
              <Text style={s.link}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.page}
            keyboardShouldPersistTaps="handled"
          >
            <PathRail
              stage={state === "check-in" || state === "done" ? 3 : 2}
              compact
            />
            <Text style={s.status}>{status}</Text>
            <Text style={s.heading}>{draft.title}</Text>
            {!!draft.direction && (
              <Text style={s.context}>{draft.direction.choice}</Text>
            )}
            <Text style={s.body}>
              {draft.minutes} min
              {draft.deadline ? ` · Deadline ${draft.deadline}` : ""}
            </Text>
            <Button
              label={editing ? "Hide wording and details" : "Edit this step"}
              disabled={busy}
              onPress={() => setEditing(!editing)}
            />
            {editing && (
              <View style={s.card}>
                <Field
                  disabled={busy}
                  label="Step"
                  value={draft.title}
                  onChange={(title) => change({ title })}
                />
                <Text style={s.label}>Time needed</Text>
                <View style={s.row}>
                  {[5, 10, 15, 30, 60].map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={`${value} minutes`}
                      disabled={busy}
                      accessibilityState={{
                        selected: minutes === String(value),
                      }}
                      onPress={() => setMinutes(String(value))}
                      style={[s.chip, minutes === String(value) && s.selected]}
                    >
                      <Text style={s.chipText}>{value} min</Text>
                    </Pressable>
                  ))}
                </View>
                <Field
                  disabled={busy}
                  label="Minutes"
                  value={minutes}
                  onChange={setMinutes}
                />
                <Field
                  disabled={busy}
                  label="Notes"
                  value={draft.notes}
                  multiline
                  onChange={(notes) => change({ notes })}
                />
                <Text style={s.small}>
                  Your original thought stays in its saved draft.
                </Text>
              </View>
            )}

            {!draft.done && (
              <View style={s.card}>
                <Text style={s.section}>What fits now?</Text>
                <View style={s.row}>
                  {(
                    [
                      ["ready", "Ready now"],
                      ["later", "Move later"],
                      ["waiting", "Waiting"],
                      ["blocked", "Blocked"],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      disabled={busy}
                      accessibilityState={{ selected: mode === value }}
                      onPress={() => chooseMode(value)}
                      style={[s.chip, mode === value && s.selected]}
                    >
                      <Text style={s.chipText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {mode !== "ready" && (
                  <>
                    <Text style={s.body}>
                      {mode === "later"
                        ? "Bring this step back on:"
                        : "Check back on this step:"}
                    </Text>
                    <View style={s.row}>
                      {(
                        [
                          [1, "Tomorrow"],
                          [3, "In 3 days"],
                          [7, "Next week"],
                        ] as const
                      ).map(([days, label]) => (
                        <Pressable
                          key={days}
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          disabled={busy}
                          accessibilityState={{
                            selected: reviewDate === after(days),
                          }}
                          onPress={() => {
                            setReviewDate(after(days));
                            setCustomDate(false);
                          }}
                          style={[
                            s.chip,
                            reviewDate === after(days) && s.selected,
                          ]}
                        >
                          <Text style={s.chipText}>{label}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Choose another date"
                        disabled={busy}
                        onPress={() => setCustomDate(!customDate)}
                        style={s.chip}
                      >
                        <Text style={s.chipText}>Another date</Text>
                      </Pressable>
                    </View>
                    {customDate ? (
                      <Field
                        disabled={busy}
                        label="Date (YYYY-MM-DD)"
                        value={reviewDate}
                        onChange={setReviewDate}
                      />
                    ) : (
                      <Text style={s.small}>
                        {reviewDate || "Choose a date above."}
                      </Text>
                    )}
                    {mode !== "later" && (
                      <>
                        <Text style={s.small}>
                          This stays in your map. Flow will show the follow-up
                          here when it is due.
                        </Text>
                        <Field
                          disabled={busy}
                          label="Waiting on / obstacle (optional)"
                          value={draft.waitingOn}
                          onChange={(waitingOn) => change({ waitingOn })}
                        />
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Schedule and contact details"
              accessibilityState={{ expanded: details }}
              disabled={busy}
              onPress={() => setDetails(!details)}
            >
              <Text style={s.link}>
                Schedule and contact details {details ? "−" : "+"}
              </Text>
            </Pressable>
            {!details && (
              <Text style={s.small}>
                {[
                  draft.plannedDate &&
                    `${draft.plannedDate}${draft.plannedTime ? ` at ${draft.plannedTime}` : ""}`,
                  draft.contactName,
                  draft.phone,
                  draft.email,
                  draft.location,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Optional — add a time or contact when you need one."}
              </Text>
            )}
            {details && (
              <View style={s.card}>
                <Field
                  disabled={busy}
                  label="Planned date (YYYY-MM-DD)"
                  value={draft.plannedDate}
                  onChange={(plannedDate) => {
                    change({ plannedDate });
                    if (mode === "ready" || mode === "later") {
                      setReviewDate(plannedDate);
                      if (validDate(plannedDate))
                        setMode(plannedDate > localDate() ? "later" : "ready");
                    }
                  }}
                />
                <Field
                  disabled={busy}
                  label="Planned time (HH:mm)"
                  value={draft.plannedTime}
                  onChange={(plannedTime) => {
                    editedTime.current = true;
                    change({ plannedTime });
                  }}
                />
                <Field
                  disabled={busy}
                  label="Deadline (YYYY-MM-DD)"
                  value={draft.deadline}
                  onChange={(deadline) => change({ deadline })}
                />
                <Field
                  disabled={busy}
                  label="Contact name"
                  value={draft.contactName ?? ""}
                  onChange={(contactName) => change({ contactName })}
                />
                <Field
                  disabled={busy}
                  label="Phone"
                  value={draft.phone ?? ""}
                  onChange={(phone) => change({ phone })}
                />
                <Field
                  disabled={busy}
                  label="Email"
                  value={draft.email ?? ""}
                  onChange={(email) => change({ email })}
                />
                <Field
                  disabled={busy}
                  label="Location"
                  value={draft.location ?? ""}
                  onChange={(location) => change({ location })}
                />
                <Field
                  disabled={busy}
                  label="Meeting or website link"
                  value={draft.meetingUrl ?? ""}
                  onChange={(meetingUrl) => change({ meetingUrl })}
                />
              </View>
            )}
            {!!error && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={s.error}
              >
                {error}
              </Text>
            )}
            {!!notice && (
              <Text accessibilityLiveRegion="polite" style={s.body}>
                {notice}
              </Text>
            )}
            {changed && (
              <Button
                label={busy ? "Saving…" : "Save changes"}
                primary
                disabled={busy}
                onPress={() => void commit("save")}
              />
            )}
            {!draft.done && (
              <Button
                label={changed ? "Save and mark done" : "Mark step done"}
                primary={!changed}
                disabled={busy}
                onPress={() => void commit("complete")}
              />
            )}
            <Button
              label="Add or update in Calendar"
              disabled={busy}
              onPress={() => void commit("calendar")}
            />
            <Text style={s.small}>
              Changes are saved in Flow. Use Calendar above to save or update an
              event and its alert.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#F7F5F0" },
  grow: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  page: { padding: 24, paddingTop: 8, gap: 16, paddingBottom: 40 },
  eyebrow: {
    color: "#6B706B",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  heading: {
    color: "#1C2522",
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "600",
  },
  status: { color: "#345BEE", fontSize: 13, fontWeight: "600" },
  context: { color: "#4B5550", fontSize: 14 },
  body: { color: "#4B5550", fontSize: 15, lineHeight: 22 },
  section: { color: "#1C2522", fontSize: 17, fontWeight: "600" },
  card: { padding: 17, borderRadius: 18, backgroundColor: "#FFFFFF", gap: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "#F3F3EF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E1E5DD",
  },
  selected: { backgroundColor: "#E6ECFF", borderColor: "#345BEE" },
  chipText: { color: "#253A71", fontSize: 13, fontWeight: "600" },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 15,
    backgroundColor: "#ECEEE8",
    alignItems: "center",
  },
  primary: { backgroundColor: "#345BEE" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#253A71" },
  white: { color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  link: { color: "#345BEE", fontSize: 14, fontWeight: "600" },
  field: { gap: 7 },
  label: { color: "#4B5550", fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#D6DCD2",
    borderRadius: 11,
    padding: 12,
    color: "#1C2522",
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  small: { color: "#747A70", fontSize: 12, lineHeight: 18 },
  error: { color: "#AA3941", fontSize: 14, lineHeight: 21 },
});
