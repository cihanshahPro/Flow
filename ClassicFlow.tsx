import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { randomUUID } from "expo-crypto";
import LegacyApp from "./LegacyApp";
import VoiceCapture, {
  AudioPlayback,
  type SavedVoiceNote,
} from "./src/components/VoiceCapture";
import {
  loadWorkspace,
  saveNote,
  registerVoiceNote,
  saveTask,
} from "./src/services/storage";
import ProfileView from "./src/components/ProfileView";
import PathRail from "./src/components/PathRail";
import PlanMap from "./src/components/PlanMap";
import TaskDetail from "./src/components/TaskDetail";
import { completeTask, reviewTask, taskState } from "./src/task-flow";
import { newProgress } from "./src/progress";
import { syncProgress } from "./src/services/progress";
import { profileCompletion } from "./src/profile-completion";
import { journeyState, directionOptions } from "./src/journey";
import { starterFor, starterDraft } from "./src/starters";
import type { DirectionContext } from "./src/model";
import Onboarding from "./src/components/Onboarding";
import { loadProfile, saveProfile } from "./src/services/profile";
import {
  AREAS,
  areaSelections,
  productivityGuide,
  newProfile,
  type Profile,
} from "./src/personality";
import DraftReview from "./src/components/DraftReview";
import ThreadReview from "./src/components/ThreadReview";
import {
  processCapturedNote,
  createThoughtDraft,
  organizeThought,
} from "./src/services/processing";
import { loadDrafts, saveDraft, acceptStep } from "./src/services/drafts";
import {
  appendPlanUpdate,
  type ThoughtDraft,
  type DraftStep,
} from "./src/drafts";
import { localDate, type Task, type Note } from "./src/model";
import {
  addTaskToCalendar,
  type ChooseCalendar,
} from "./src/services/calendar";

type Screen = "Today" | "My mind" | "Library" | "Profile" | "Feedback";
const C = {
  paper: "#F6F7FA",
  ink: "#142138",
  muted: "#697386",
  line: "#E2E6ED",
  blue: "#345BEE",
  lime: "#DFF586",
  white: "#FFFFFF",
  soft: "#EDF0FF",
  red: "#B44343",
};
function Tap({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.tap,
        primary ? s.primary : s.secondary,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[s.tapText, primary && { color: C.white }]}>{label}</Text>
    </Pressable>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
export default function ClassicApp() {
  return (
    <SafeAreaProvider>
      <Flow />
    </SafeAreaProvider>
  );
}
function Flow() {
  const [screen, setScreen] = useState<Screen>("Today");
  const [profile, setProfile] = useState<Profile>(newProfile());
  const [progress, setProgress] = useState(newProgress());
  const [onboarding, setOnboarding] = useState(false);
  const [completionSection, setCompletionSection] = useState<
    "assessment" | "areas" | undefined
  >();
  const [timeChosenFor, setTimeChosenFor] = useState<string | null>(null);
  const [captureKind, setCaptureKind] = useState<
    "thought" | "note" | "feedback"
  >("thought");
  const [captureTopic, setCaptureTopic] = useState("");
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drafts, setDrafts] = useState<ThoughtDraft[]>([]);
  const [budget, setBudget] = useState(30);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [composer, setComposer] = useState<"text" | "voice" | null>(null);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [threadDeveloping, setThreadDeveloping] = useState(false);
  const [refining, setRefining] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [settings, setSettings] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceResult, setVoiceResult] = useState<Note | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const processingLock = useRef(false);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const captureId = useRef("");
  const captureDirection = useRef<DirectionContext | undefined>(undefined);
  const pendingDraft = useRef<string | null>(null);
  function finishSheetTransition() {
    if (pendingTask.current) {
      setEditingTask(pendingTask.current);
      pendingTask.current = null;
    }
    if (pendingDraft.current) {
      setSelected(pendingDraft.current);
      pendingDraft.current = null;
    }
  }
  function revealDraftAfterSheet(id: string) {
    if (Platform.OS === "ios") pendingDraft.current = id;
    else setSelected(id);
  }
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const pendingTask = useRef<Task | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const contentScroll = useRef<ScrollView>(null);
  function navigate(next: Screen) {
    setScreen(next);
    setNotice("");
    setError("");
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }
  function closeThread() {
    setSelected(null);
    setThreadDeveloping(false);
  }
  function threadPrompt(draft: ThoughtDraft): string {
    const area = draft.direction?.areaId;
    if (area === "people" || area === "admin" || area === "dates") {
      return "What person, date, or commitment matters most in this thread?";
    }
    if (area === "health") {
      return "What outcome or appointment are you trying to get clear about?";
    }
    if (area === "work" || area === "home") {
      return "What result would make this thread feel resolved?";
    }
    return "What is the most important outcome you want Flow to understand?";
  }
  async function refresh() {
    const [w, d] = await Promise.all([loadWorkspace(), loadDrafts()]);
    setTasks(w.tasks);
    setNotes(w.notes);
    setDrafts(d);
    await refreshProgress();
  }
  async function refreshProgress() {
    try {
      const saved = await syncProgress();
      setProgress(saved);
      setProgressError("");
      return saved;
    } catch {
      setProgressError(
        "Your work is saved. Accomplishment progress could not update yet.",
      );
      return null;
    }
  }
  useEffect(() => {
    Promise.all([
      refresh(),
      loadProfile().then((p) => {
        setProfile(p);
        if (typeof p.preferredMinutes === "number") {
          setBudget(p.preferredMinutes);
          setTimeChosenFor(localDate());
        } else if (p.preferredMinutes === "varies") setBudget(10);
        setOnboarding(!p.completed && p.stage === "intro");
      }),
    ])
      .then(() => {
        setReady(true);
        Animated.timing(fade, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      })
      .catch((e) => setError(e.message));
  }, []);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Your saved thoughts are safe.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function capture(
    mode: "text" | "voice",
    draftId: string | null = null,
    topic = "",
    direction?: DirectionContext,
    kind: "thought" | "note" | "feedback" = "thought",
  ) {
    setCaptureKind(kind);
    captureDirection.current =
      direction ?? drafts.find((d) => d.id === draftId)?.direction;
    setCaptureTopic(topic);
    setVoiceResult(null);
    setProcessingError("");
    captureId.current = randomUUID();
    setRefining(draftId);
    setInput("");
    setCaptureVisible(false);
    setComposer(mode);
    setNotice("");
  }
  async function submit() {
    await run(async () => {
      const text = input.trim();
      if (!text) return;
      const id = captureId.current || randomUUID();
      const n: Note = {
        id,
        direction: captureDirection.current,
        planId: refining ?? undefined,
        captureKind,
        title: text.slice(0, 80),
        text,
        createdAt: new Date().toISOString(),
      };
      await saveNote(n);
      if (captureKind !== "thought") {
        setComposer(null);
        setInput("");
        navigate(captureKind === "feedback" ? "Feedback" : "Library");
        setNotice(
          captureKind === "feedback"
            ? "Feedback saved here. Nothing sent or added to your plan."
            : "Note saved in Library. No task created.",
        );
        return;
      }
      const prior = drafts.find((d) => d.id === refining);
      const shaped = await createThoughtDraft(id, text, n.direction);
      const d = prior ? appendPlanUpdate(prior, shaped) : shaped;
      await saveDraft(d);
      setSelected(null);
      setComposer(null);
      setInput("");
      navigate("My mind");
      setNotice(
        prior
          ? "Update saved to this draft."
          : "Thought saved to its thread. Flow will keep processing it in the background.",
      );
    });
  }
  async function voiceSaved(v: SavedVoiceNote) {
    // Registration alone decides whether recording saved successfully.
    await registerVoiceNote({
      ...v,
      direction: v.captureKind ? undefined : captureDirection.current,
      planId: v.captureKind ? undefined : refining ?? undefined,
      captureKind: v.captureKind ?? captureKind,
      id: v.audioUri,
      createdAt: new Date().toISOString(),
    });
  }
  async function processRecording(entry: Note, origin: "capture" | "library") {
    if (processingLock.current) return;
    processingLock.current = true;
    setProcessing(true);
    setProcessingError("");
    try {
      const result = await processCapturedNote(entry);
      await refresh();
      if (result.kind === "note") {
        if (origin === "capture") setComposer(null);
        else setNote(null);
        navigate(
          result.note.captureKind === "feedback" ? "Feedback" : "Library",
        );
        setNotice("Recording and transcript saved here. No task created.");
        return;
      }
      if (result.kind !== "draft") return;
      const draft = result.draft;
      setSelected(null);
      if (origin === "capture") setComposer(null);
      else setNote(null);
      navigate("My mind");
      setNotice("Transcribed and shaped. Choose only what helps.");
    } catch (failure) {
      setProcessingError(
        failure instanceof Error
          ? failure.message
          : "Processing paused. Your recording is saved.",
      );
      await refresh().catch(() => {});
    } finally {
      processingLock.current = false;
      setProcessing(false);
    }
  }
  function recordingCompleted(saved: SavedVoiceNote) {
    const entry: Note = {
      ...saved,
      direction: captureDirection.current,
      planId: refining ?? undefined,
      captureKind,
      id: saved.audioUri,
      createdAt: new Date().toISOString(),
    };
    setVoiceBusy(false);
    setVoiceResult(entry);
    void processRecording(entry, "capture");
  }
  const journey = journeyState(
    profile.preferredMinutes === "varies" && timeChosenFor === localDate()
      ? { ...profile, preferredMinutes: budget as 10 | 30 | 60 }
      : profile,
    notes,
    drafts,
    tasks,
  );
  const completion = profileCompletion(profile);
  const next = journey.next;
  const suggestedStarter = next.direction ? starterFor(next.direction) : null;
  const nextTask = [
    "task",
    "check-in",
    "follow-up",
    "scheduled",
    "paused",
  ].includes(next.kind)
    ? tasks.find((t) => t.id === next.id)
    : undefined;
  const nextPlan = nextTask
    ? drafts.find((d) =>
        d.steps.some((step) => nextTask.id === `flow:${d.id}:${step.id}`),
      )
    : next.kind === "draft"
      ? drafts.find((d) => d.id === next.id)
      : undefined;
  const pathStage: 0 | 1 | 2 | 3 =
    next.kind === "setup"
      ? 0
      : ["check-in", "follow-up", "paused", "complete"].includes(next.kind)
        ? 3
        : ["task", "scheduled"].includes(next.kind)
          ? 2
          : 1;
  function openTask(task: Task) {
    if (selected && Platform.OS === "ios") pendingTask.current = task;
    else setEditingTask(task);
    setSelected(null);
  }
  async function saveWorkingTask(task: Task) {
    // Let the sheet handle failures; never close on an unsuccessful save.
    if (lock.current)
      throw new Error("Another save is in progress. Try again.");
    lock.current = true;
    setBusy(true);
    try {
      await saveTask(task);
      await refresh();
      setEditingTask(task);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function finishWorkingTask(task: Task) {
    await saveWorkingTask(completeTask(task));
    setEditingTask(null);
    navigate("Today");
  }
  async function checkIn(keepGoing: boolean) {
    if (!nextTask) return;
    await run(async () => {
      if (!keepGoing) {
        await updateProfile({ ...profile, activeTaskId: nextTask.id });
        await saveTask(reviewTask(nextTask));
        setNotice(
          "This stopping point is saved. Resume whenever you’re ready.",
        );
        return;
      }
      // Opening a choice is not completing it. Keep the check-in until a next step is saved.
      const pendingUpdate =
        nextPlan &&
        notes.find(
          (note) =>
            note.planId === nextPlan.id &&
            !nextPlan.sourceNoteIds?.includes(note.id),
        );
      if (pendingUpdate) {
        setProcessingError("");
        setNote(pendingUpdate);
        return;
      }
      if (nextPlan?.steps.some((step) => !step.accepted && !step.deferred)) {
        setSelected(nextPlan.id);
      } else {
        capture(
          "voice",
          nextPlan?.id ?? null,
          `You finished “${nextTask.title}”. Is there a reply or another step to plan? Tell me only what changed.`,
          nextTask.direction,
        );
      }
    });
  }
  async function updateProfile(p: Profile) {
    await saveProfile(p);
    if (p.preferredMinutes !== profile.preferredMinutes) {
      setBudget(
        typeof p.preferredMinutes === "number" ? p.preferredMinutes : 10,
      );
      setTimeChosenFor(
        typeof p.preferredMinutes === "number" ? localDate() : null,
      );
    }
    setProfile(p);
    await refreshProgress();
  }
  function finishProfileSection() {
    setOnboarding(false);
    if (completionSection) {
      setCompletionSection(undefined);
      navigate("Profile");
    }
  }
  async function openProfileSection(
    section: "assessment" | "areas",
    requestedIndex?: number,
  ) {
    await run(async () => {
      const index = AREAS.findIndex(
        (a) =>
          profile.areas[a.id] !== "Nothing current" &&
          !areaSelections(profile.areas[a.id]).some((c) =>
            a.choices.includes(c),
          ),
      );
      await updateProfile({
        ...profile,
        stage: section,
        areaIndex: requestedIndex ?? (index < 0 ? 0 : index),
      });
      setCompletionSection(section);
      setOnboarding(true);
    });
  }
  function continueJourney() {
    navigate("Today");
    if (next.kind === "setup") {
      navigate("Profile");
      return;
    }
    if (next.kind === "draft") {
      setSelected(next.id!);
      return;
    }
    if (next.kind === "process") {
      const n = notes.find((n) => n.id === next.id);
      if (n) {
        setNote(n);
        setProcessingError("");
      }
      return;
    }
  }
  async function useStarter(direction: DirectionContext) {
    await run(async () => {
      const id = starterDraft(direction).id;
      const d = drafts.find((d) => d.id === id) ?? starterDraft(direction);
      await saveDraft(d);
      await acceptStep(d, d.steps[0]);
      const selectedDirection = directionOptions(profile).find(
        (d) => d.directionId === direction.directionId,
      );
      await updateProfile({
        ...profile,
        completed: true,
        activeTaskId: `flow:${d.id}:${d.steps[0].id}`,
        ...(selectedDirection
          ? {
              focus: selectedDirection.title,
              focusExplicit: true,
              focusNone: false,
            }
          : {}),
      });
      setOnboarding(false);
      navigate("Today");
      setNotice("Your next action is ready. Everything else stays saved.");
    });
  }
  function guidedCapture(direction: DirectionContext) {
    setOnboarding(false);
    capture(
      "voice",
      null,
      `Dump everything connected to ${direction.choice.toLowerCase()}. Include what matters, what is active, and what you do not want to forget. Do not organize it.`,
      direction,
    );
  }
  const current = drafts.find((d) => d.id === selected);
  const effectiveBudget =
    profile.preferredMinutes === "varies" && timeChosenFor !== localDate()
      ? 10
      : budget;
  const choose: ChooseCalendar = (options, preferred) =>
    new Promise((resolve) =>
      Alert.alert(
        "Choose your calendar",
        "We’ll remember this for next time.",
        [
          ...options.map((c) => ({
            text: c.title + (c.id === preferred ? " · default" : ""),
            onPress: () => resolve(c.id),
          })),
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        ],
        { cancelable: false },
      ),
    );
  async function add(d: ThoughtDraft, step: DraftStep) {
    await run(async () => {
      await acceptStep(d, step);
      await updateProfile({
        ...profile,
        activeTaskId: `flow:${d.id}:${step.id}`,
      });
      for (const previous of tasks.filter(
        (t) =>
          taskState(t) === "check-in" &&
          d.steps.some((s) => t.id === `flow:${d.id}:${s.id}`),
      )) {
        await saveTask(reviewTask(previous));
      }
      setSelected(null);
      navigate("Today");
      setNotice("Your chosen action is ready below.");
    });
  }
  async function organizeCurrent(draft: ThoughtDraft) {
    setOrganizing(true);
    await run(async () => {
      const shaped = await organizeThought(
        draft.id,
        [draft.source, ...draft.updates].join("\n\n"),
        draft.direction,
      );
      const preserved = draft.steps.filter(
        (step) => step.accepted || step.deferred,
      );
      await saveDraft({
        ...shaped,
        source: draft.source,
        sourceNoteIds: draft.sourceNoteIds,
        updates: draft.updates,
        state: draft.state,
        createdAt: draft.createdAt,
        example: draft.example,
        steps: [
          ...preserved,
          ...shaped.steps
            .filter(
              (step) =>
                !preserved.some(
                  (old) => old.title.toLowerCase() === step.title.toLowerCase(),
                ),
            )
            .slice(0, 3)
            .map((step, i) => ({ ...step, id: `ai-${Date.now()}-${i}` })),
        ],
      });
      setNotice(
        "Sorted into a few possibilities. Nothing added to your day yet.",
      );
    });
    setOrganizing(false);
  }
  function chooseDraftStep(
    draft: ThoughtDraft,
    step: DraftStep,
    smaller: boolean,
  ) {
    void add(
      draft,
      smaller
        ? {
            ...step,
            title: step.smallAction ?? `Spend five minutes on: ${step.title}`,
            minutes: 5,
          }
        : step,
    );
  }
  function deferDraftStep(
    draft: ThoughtDraft,
    step: DraftStep,
    deferred: boolean,
  ) {
    void run(async () => {
      await saveDraft({
        ...draft,
        steps: draft.steps.map((x) =>
          x.id === step.id ? { ...x, deferred } : x,
        ),
      });
      setNotice(
        deferred
          ? "Kept for later. Nothing added to Today."
          : "This option is back.",
      );
    });
  }
  function closeCapture() {
    if (!voiceBusy && !busy && !processing) setComposer(null);
  }
  if (advanced)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAdvanced(false);
            void refresh();
          }}
          style={s.back}
        >
          <Text style={s.tapText}>‹ Back to Flow</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <LegacyApp />
        </View>
      </SafeAreaView>
    );
  if (ready && onboarding)
    return (
      <SafeAreaView style={s.safe}>
        <Onboarding
          profile={profile}
          onSave={updateProfile}
          onClose={finishProfileSection}
          sectionMode={completionSection}
          onCapture={(topic) => {
            const d = directionOptions(profile).find((d) => d.title === topic);
            if (d) guidedCapture(d);
          }}
          onStart={(topic) => {
            const d = directionOptions(profile).find((d) => d.title === topic);
            if (d) void useStarter(d);
          }}
          onContinue={() => {
            setOnboarding(false);
            if (next.kind === "draft" || next.kind === "process")
              continueJourney();
            else navigate("Today");
          }}
          externalBusy={busy}
          externalError={error || progressError}
          existingWork={[
            "task",
            "draft",
            "process",
            "check-in",
            "follow-up",
            "scheduled",
            "paused",
          ].includes(next.kind)}
        />
      </SafeAreaView>
    );
  if (!ready)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loading}>
          <Text style={s.brand}>flow.</Text>
          {error ? (
            <>
              <Text style={s.error}>{error}</Text>
              <Tap
                label="Try again"
                onPress={() =>
                  void run(async () => {
                    await refresh();
                    setReady(true);
                    fade.setValue(1);
                  })
                }
              />
            </>
          ) : (
            <ActivityIndicator color={C.blue} />
          )}
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.brand}>
          flow<Text style={{ color: C.blue }}>.</Text>
        </Text>
        <View style={s.row}>
          <Text style={s.test}>TEST · 11</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Feedback"
            onPress={() => navigate("Feedback")}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={s.smallLink}>Feedback</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings and existing tools"
            onPress={() => setSettings(true)}
            style={s.avatar}
          >
            <Text style={{ color: C.ink, fontSize: 21 }}>⋯</Text>
          </Pressable>
        </View>
      </View>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <ScrollView
          ref={contentScroll}
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <Pressable
              onPress={() => setError("")}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            </Pressable>
          )}
          {!!notice && (
            <Pressable
              onPress={() => setNotice("")}
              accessibilityRole="button"
              accessibilityLabel="Dismiss status"
            >
              <Text accessibilityLiveRegion="polite" style={s.notice}>
                {notice}
              </Text>
            </Pressable>
          )}
          {!!progressError && (
            <View style={s.quiet}>
              <Text accessibilityRole="alert" style={s.body}>
                {progressError}
              </Text>
              <Tap
                label="Retry progress update"
                onPress={() =>
                  void run(async () => {
                    await refreshProgress();
                  })
                }
                disabled={busy}
              />
            </View>
          )}
          {screen === "Today" && (
            <>
              <Text style={[s.headline, { fontSize: 32, lineHeight: 38 }]}>
                Pick up right here.
              </Text>
              <PathRail stage={pathStage} compact />
              {profile.preferredMinutes === "varies" &&
                timeChosenFor !== localDate() && (
                  <View style={s.quiet}>
                    <Text style={s.body}>How much time fits today?</Text>
                    <View style={s.captureRow}>
                      {[10, 30, 60].map((minutes) => (
                        <Tap
                          key={minutes}
                          label={`${minutes} min`}
                          onPress={() => {
                            setBudget(minutes);
                            setTimeChosenFor(localDate());
                          }}
                        />
                      ))}
                    </View>
                  </View>
                )}
              <View style={{ gap: 5 }}>
                <Label>YOUR PLAN</Label>
                <Text style={s.body}>
                  {next.direction
                    ? AREAS.find((a) => a.id === next.direction?.areaId)?.title
                    : "Your saved work"}
                  {next.direction ? ` → ${next.direction.choice}` : ""}
                </Text>
                <Text numberOfLines={1} style={s.taskTitle}>
                  {nextPlan?.title ??
                    (next.kind === "starter"
                      ? "First plan · not shaped yet"
                      : nextTask
                        ? "Saved action"
                        : next.kind === "setup"
                          ? "Your starting profile"
                          : "Your next decision")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigate("My mind")}
                >
                  <Text style={s.smallLink}>
                    See my plan and all its steps →
                  </Text>
                </Pressable>
              </View>
              <View style={s.hero}>
                <Text style={s.heroKicker}>
                  {next.kind === "check-in"
                    ? "STEP FINISHED · CHECK IN"
                    : next.kind === "follow-up"
                      ? "FOLLOW-UP DUE"
                      : next.kind === "scheduled"
                        ? "SAVED FOR LATER"
                        : next.kind === "paused"
                          ? "YOUR PLACE IS SAVED"
                          : next.kind === "task"
                            ? "YOUR CHOSEN STEP"
                            : "NEXT"}
                </Text>
                <Text
                  numberOfLines={3}
                  style={[s.heroTitle, { fontSize: 28, lineHeight: 34 }]}
                >
                  {next.kind === "starter"
                    ? `Let’s shape ${next.direction?.choice.toLowerCase()}.`
                    : nextTask
                      ? nextTask.title
                      : next.title}
                </Text>
                <Text style={s.heroSub}>
                  {next.kind === "starter"
                    ? "Add a few real details. We’ll turn them into a small plan you can review, then choose one step."
                    : next.kind === "process"
                      ? "Your original words are saved. Continue from them without recording again."
                      : next.kind === "draft"
                        ? "Your words have become a draft. Review the suggested steps and choose one to start."
                        : next.kind === "task"
                          ? `${nextTask?.minutes} minutes · Open this step to work on it, edit it, or choose when to return.`
                          : next.kind === "check-in"
                            ? "You finished this step. Continue the same plan, or save a clear stopping point."
                            : next.kind === "follow-up"
                              ? `You asked to check back ${nextTask?.chaseDate || "now"}. Decide if this is ready, still waiting, or finished.`
                              : next.kind === "scheduled"
                                ? `Nothing to do on this step now. ${nextTask?.chaseDate ? `Check back on ${nextTask.chaseDate}.` : nextTask?.plannedDate ? `Planned for ${nextTask.plannedDate}.` : "Choose a check-in date to know when to return."} You can adjust it below.`
                                : next.kind === "paused"
                                  ? "This step is finished and your plan is saved. You decide when to continue."
                                  : next.kind === "complete"
                                    ? "No saved step needs a decision now. Your map keeps the history; add a new thought when something changes."
                                    : "We’ll use your saved answers. Finish the next missing section, then shape your first plan."}
                </Text>
                {next.kind === "starter" && next.direction && (
                  <Tap
                    label="Shape my first plan"
                    onPress={() => guidedCapture(next.direction!)}
                    primary
                    disabled={busy}
                  />
                )}
                {["task", "follow-up", "scheduled"].includes(next.kind) &&
                  nextTask && (
                    <Tap
                      label={
                        next.kind === "task"
                          ? "Open my step"
                          : next.kind === "follow-up"
                            ? "Review this follow-up"
                            : "View or change this step"
                      }
                      onPress={() => openTask(nextTask)}
                      primary
                      disabled={busy}
                    />
                  )}
                {next.kind === "check-in" && (
                  <>
                    <Tap
                      label={
                        nextPlan?.steps.some(
                          (step) => !step.accepted && !step.deferred,
                        )
                          ? "Choose the next step in this plan"
                          : "Update this plan"
                      }
                      onPress={() => void checkIn(true)}
                      primary
                      disabled={busy}
                    />
                    <Tap
                      label="Pause here for now"
                      onPress={() => void checkIn(false)}
                      disabled={busy}
                    />
                  </>
                )}
                {["setup", "draft", "process"].includes(next.kind) && (
                  <Tap
                    label={
                      next.kind === "draft"
                        ? "Review my plan"
                        : next.kind === "process"
                          ? "Resume my saved thought"
                          : "Continue my setup"
                    }
                    onPress={continueJourney}
                    primary
                    disabled={busy}
                  />
                )}
                {next.kind === "paused" && (
                  <Tap
                    label="Continue my path"
                    onPress={() =>
                      void run(async () => {
                        await updateProfile({
                          ...profile,
                          activeTaskId: undefined,
                        });
                      })
                    }
                    primary
                    disabled={busy}
                  />
                )}
                {next.kind === "complete" && (
                  <Tap
                    label="Add what’s next"
                    onPress={() => capture("voice")}
                    primary
                  />
                )}
              </View>
              {next.kind === "starter" && next.direction && (
                <Tap
                  label="Help me with a suggested first step"
                  onPress={() => void useStarter(next.direction!)}
                  disabled={busy}
                />
              )}
              {next.kind === "task" &&
                nextTask &&
                nextTask.minutes > effectiveBudget && (
                  <Text style={s.body}>
                    This chosen step is longer than your {effectiveBudget}
                    -minute window. Open it to make it smaller or move it to a
                    better time.
                  </Text>
                )}
              {nextPlan && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelected(nextPlan.id)}
                >
                  <Text style={s.smallLink}>
                    Review the plan behind this step →
                  </Text>
                </Pressable>
              )}
              {completion.percent < 100 && next.kind !== "setup" && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Finish my profile, ${completion.percent}% complete`}
                  onPress={() => navigate("Profile")}
                  style={s.quiet}
                >
                  <Text style={s.meta}>
                    Profile {completion.percent}% · {completion.next?.title}{" "}
                    still to fill
                  </Text>
                </Pressable>
              )}
              <Text style={s.body}>
                Your plans and steps live in My mind. Notes and recordings stay
                in Library.
              </Text>
            </>
          )}
          {screen === "Profile" && (
            <ProfileView
              profile={profile}
              progress={progress}
              notes={notes}
              drafts={drafts}
              tasks={tasks}
              busy={busy}
              onContinue={continueJourney}
              onCapture={() => capture("voice")}
              onConfigure={async (patch) => {
                if (lock.current)
                  throw new Error("Another save is in progress.");
                lock.current = true;
                setBusy(true);
                try {
                  await updateProfile({ ...profile, ...patch });
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
              onCompleteAssessment={() => void openProfileSection("assessment")}
              onCompleteAreas={(index) =>
                void openProfileSection("areas", index)
              }
              onEditAreas={() =>
                void run(async () => {
                  await updateProfile({
                    ...profile,
                    stage: "areas",
                    areaIndex: 0,
                  });
                  setOnboarding(true);
                })
              }
              onAssessment={() =>
                void run(async () => {
                  await updateProfile({
                    ...profile,
                    stage:
                      profile.answers.length === 20 ? "results" : "assessment",
                  });
                  setOnboarding(true);
                })
              }
              onPreference={() =>
                void run(async () => {
                  await updateProfile({
                    ...profile,
                    presentation:
                      productivityGuide(profile.answers, profile.presentation)
                        .presentation === "sequence"
                        ? "small"
                        : "sequence",
                  });
                  setNotice("Guidance style updated.");
                })
              }
              onFocus={(title) =>
                void run(async () => {
                  await updateProfile({
                    ...profile,
                    focus: title,
                    activeTaskId: undefined,
                    focusExplicit: true,
                    focusNone: false,
                  });
                  navigate("Today");
                })
              }
            />
          )}
          {screen === "My mind" && (
            <>
              <Label>YOUR MAP · THOUGHT TO ACTION</Label>
              <Text style={s.headline}>See how it fits.</Text>
              <PathRail stage={pathStage} compact />
              <Text style={s.body}>
                Thoughts become plans here. Each plan keeps its original words
                and chosen steps together.
              </Text>
              <Tap
                label="Return to my next step"
                onPress={() => navigate("Today")}
                primary
              />
              <Tap
                label="Add a thought to My mind"
                onPress={() => capture("voice")}
              />
              <PlanMap
                profile={profile}
                notes={notes.filter(
                  (n) => !n.captureKind || n.captureKind === "thought",
                )}
                drafts={drafts}
                tasks={tasks}
                currentTaskId={nextTask?.id}
                onOpenTask={openTask}
                onOpenDraft={(d) => setSelected(d.id)}
                onOpenNote={(n) => {
                  setProcessingError("");
                  setNote(n);
                }}
                onCapture={(direction) =>
                  direction ? guidedCapture(direction) : capture("voice")
                }
              />
            </>
          )}
          {screen === "Library" && (
            <>
              <Label>LIBRARY · ORIGINALS</Label>
              <Text style={s.headline}>Your words.{"\n"}Kept safe.</Text>
              <Text style={s.intro}>
                Original thoughts and recordings live here, even as your plans
                change.
              </Text>
              <Tap
                label="Save a note to Library"
                onPress={() =>
                  capture(
                    "voice",
                    null,
                    "Keep this as a note. We’ll save your words without creating a plan.",
                    undefined,
                    "note",
                  )
                }
                primary
              />
              {notes
                .filter((n) => n.captureKind !== "feedback")
                .map((n) => (
                  <Pressable
                    key={n.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setProcessingError("");
                      setNote(n);
                    }}
                    style={s.libraryRow}
                  >
                    <View style={s.noteIcon}>
                      <Text style={{ fontSize: 22, color: C.blue }}>
                        {n.audioUri ? "≋" : "≡"}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text numberOfLines={2} style={s.taskTitle}>
                        {n.title}
                      </Text>
                      <Text style={s.meta}>
                        {n.captureKind === "note"
                          ? "Kept note · "
                          : "Original thought · "}
                        {n.audioUri ? "Voice · " : ""}
                        {new Date(n.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                      {n.audioUri && !n.text && (
                        <Text style={s.meta}>Audio saved · tap to process</Text>
                      )}
                    </View>
                    <Text style={s.arrow}>↗</Text>
                  </Pressable>
                ))}
              {!notes.filter((n) => n.captureKind !== "feedback").length && (
                <View style={s.emptyCard}>
                  <Text style={s.cardTitle}>A fresh page.</Text>
                  <Text style={s.body}>
                    Speak or write. We’ll keep the original here.
                  </Text>
                  <Tap
                    label="Write a note"
                    onPress={() => capture("text", null, "", undefined, "note")}
                    primary
                  />
                </View>
              )}
            </>
          )}
          {screen === "Feedback" && (
            <>
              <Label>FEEDBACK · ABOUT FLOW</Label>
              <Text style={s.headline}>Tell us as you go.</Text>
              <Text style={s.body}>
                What felt confusing, missing, or helpful? Speak or write it
                here. Feedback stays separate from your plans and is saved on
                this device; it is not sent automatically.
              </Text>
              <Tap
                label="Record feedback"
                onPress={() =>
                  capture(
                    "voice",
                    null,
                    "What were you trying to do, and what happened?",
                    undefined,
                    "feedback",
                  )
                }
                primary
              />
              <Tap
                label="Write feedback"
                onPress={() => capture("text", null, "", undefined, "feedback")}
              />
              {notes
                .filter((n) => n.captureKind === "feedback")
                .map((n) => (
                  <Pressable
                    key={n.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open feedback: ${n.title}`}
                    onPress={() => {
                      setProcessingError("");
                      setNote(n);
                    }}
                    style={s.libraryRow}
                  >
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={s.taskTitle}>{n.title}</Text>
                      <Text style={s.meta}>
                        {n.audioUri ? "Recording" : "Written feedback"} ·{" "}
                        {new Date(n.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              <Tap
                label="Return to my path"
                onPress={() => navigate("Today")}
              />
            </>
          )}
          <Text style={s.footer}>Less to manage. More room to live.</Text>
        </ScrollView>
      </Animated.View>
      <View style={s.nav}>
        {(["Today", "My mind", "Library", "Profile"] as Screen[]).map(
          (t, i) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: screen === t }}
              onPress={() => navigate(t)}
              style={s.navItem}
            >
              <Text style={[s.navIcon, screen === t && { color: C.blue }]}>
                {["◉", "⌘", "▤", "◎"][i]}
              </Text>
              <Text
                style={[
                  s.navText,
                  screen === t && { color: C.ink, fontWeight: "700" },
                ]}
              >
                {t}
              </Text>
            </Pressable>
          ),
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            screen === "Library"
              ? "Save a note"
              : screen === "Feedback"
                ? "Add feedback"
                : "Capture a thought"
          }
          onPress={() =>
            capture(
              "text",
              null,
              "",
              undefined,
              screen === "Library"
                ? "note"
                : screen === "Feedback"
                  ? "feedback"
                  : "thought",
            )
          }
          style={s.navCapture}
        >
          <Text style={{ fontSize: 28, color: C.white }}>＋</Text>
        </Pressable>
      </View>
      <Modal
        visible={composer !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCapture}
        onShow={() => setCaptureVisible(true)}
        onDismiss={finishSheetTransition}
      >
        <SafeAreaView style={s.sheet}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={s.sheetHead}>
              <Label>
                {captureKind === "feedback"
                  ? "FEEDBACK · ABOUT FLOW"
                  : captureKind === "note"
                    ? "LIBRARY · KEEP A NOTE"
                    : refining
                      ? "CONTINUE THIS PLAN"
                      : "MY MIND · CAPTURE A THOUGHT"}
              </Label>
              <Tap
                label="Close"
                onPress={closeCapture}
                disabled={voiceBusy || busy || processing}
              />
            </View>
            <ScrollView
              contentContainerStyle={s.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.sheetTitle}>
                {composer === "voice"
                  ? "Say it your way."
                  : "No need to\norganize it first."}
              </Text>
              {composer === "voice" ? (
                <>
                  {voiceResult ? (
                    <View style={s.emptyCard}>
                      <Text style={s.cardTitle}>
                        {processing
                          ? captureKind === "thought"
                            ? "Turning your words into a draft…"
                            : "Transcribing your recording…"
                          : "Recording saved."}
                      </Text>
                      {processing ? (
                        <ActivityIndicator color={C.blue} />
                      ) : (
                        <AudioPlayback uri={voiceResult.audioUri!} />
                      )}
                      <Text style={s.body}>
                        {processing
                          ? "Turning your audio into text on this phone. Your original audio stays here."
                          : processingError}
                      </Text>
                      {!processing && (
                        <Tap
                          label="Retry processing"
                          primary
                          onPress={() =>
                            void processRecording(voiceResult, "capture")
                          }
                        />
                      )}
                    </View>
                  ) : (
                    <>
                      <View>
                        {!!captureTopic && (
                          <Text style={s.body}>{captureTopic}</Text>
                        )}
                      </View>
                      <VoiceCapture
                        compact
                        autoStart={captureVisible}
                        onActivityChange={setVoiceBusy}
                        onSaved={voiceSaved}
                        onComplete={recordingCompleted}
                      />
                    </>
                  )}
                  <Text style={s.body}>
                    {captureKind === "thought"
                      ? "Stop once. We save the audio, transcribe it, and open a draft here."
                      : `Stop once. Your recording and transcript stay in ${captureKind === "feedback" ? "Feedback" : "Library"}; no plan or task is created.`}{" "}
                    Your recording is saved on this phone.
                  </Text>
                  {!voiceBusy && !voiceResult && (
                    <Tap
                      label="Write or use keyboard dictation instead"
                      onPress={() => setComposer("text")}
                    />
                  )}
                </>
              ) : (
                <>
                  <TextInput
                    autoFocus
                    multiline
                    maxLength={20000}
                    value={input}
                    onChangeText={setInput}
                    editable={!busy}
                    placeholder={
                      captureKind === "feedback"
                        ? "What were you trying to do? What felt confusing or useful?"
                        : captureKind === "note"
                          ? "Something to remember, a reference, a thought to keep…"
                          : refining
                            ? "What changed? What else is on your mind?"
                            : "An idea, a loose end, something you want to do…"
                    }
                    placeholderTextColor="#8D95A4"
                    accessibilityLabel={
                      captureKind === "thought"
                        ? "Your thought"
                        : captureKind === "note"
                          ? "Your note"
                          : "Your feedback"
                    }
                    style={s.thoughtInput}
                  />
                  <View style={s.hintRow}>
                    <Text style={s.meta}>Your words are enough.</Text>
                    <Text style={s.meta}>{input.length}/20,000</Text>
                  </View>
                  <Tap
                    label={
                      busy
                        ? captureKind === "thought"
                          ? "Making sense of it…"
                          : "Saving…"
                        : captureKind === "feedback"
                          ? "Save feedback"
                          : captureKind === "note"
                            ? "Save note"
                            : refining
                              ? "Add to this plan  ↗"
                              : "Shape this thought  ↗"
                    }
                    primary
                    disabled={busy || !input.trim()}
                    onPress={() => void submit()}
                  />
                  <Text style={s.previewHint}>
                    {captureKind === "thought"
                      ? "Flow can organize this for you. Your original words are always kept."
                      : `Saved in ${captureKind === "feedback" ? "Feedback" : "Library"}. This won’t create a task or change your plan.`}
                  </Text>
                  <Tap
                    label="Speak instead"
                    onPress={() => setComposer("voice")}
                    disabled={busy}
                  />
                </>
              )}
              {!!error && <Text style={s.error}>{error}</Text>}
              {!!notice && <Text style={s.notice}>{notice}</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!current}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!busy) closeThread();
        }}
        onDismiss={finishSheetTransition}
      >
        <SafeAreaView style={s.sheet}>
          <View style={s.sheetHead}>
            <Label>
              {current?.example ? "EXAMPLE · TRY THE FLOW" : "A WORKING DRAFT"}
            </Label>
            <Tap
              label="Done"
              onPress={closeThread}
              disabled={busy}
            />
          </View>
          {current && (
            threadDeveloping ? <DraftReview
              presentation={profile.presentation}
              key={current.id}
              draft={current}
              tasks={tasks}
              onOpenTask={openTask}
              busy={busy}
              organizing={organizing}
              onChoose={(step, smaller) =>
                chooseDraftStep(current, step, smaller)
              }
              onDefer={(step, deferred) =>
                deferDraftStep(current, step, deferred)
              }
              onOrganize={() => void organizeCurrent(current)}
              onClose={closeThread}
              onPark={() =>
                void run(async () => {
                  await saveDraft({
                    ...current,
                    state: current.state === "parked" ? "draft" : "parked",
                  });
                  setSelected(null);
                  setNotice("Thought kept. You can return whenever you want.");
                })
              }
              error={error}
              notice={notice}
            />
            : <ThreadReview
              draft={current}
              busy={busy}
              onClose={closeThread}
              prompt={threadPrompt(current)}
              onCapture={() => capture("voice", current.id, threadPrompt(current), current.direction)}
              onDevelop={() => setThreadDeveloping(true)}
            />
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!note}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!processing) setNote(null);
        }}
        onDismiss={finishSheetTransition}
      >
        <SafeAreaView style={s.sheet}>
          <View style={s.sheetHead}>
            <Label>
              {note?.captureKind === "feedback"
                ? "SAVED FEEDBACK"
                : note?.captureKind === "note"
                  ? "SAVED NOTE"
                  : "ORIGINAL THOUGHT"}
            </Label>
            <Tap
              label="Done"
              onPress={() => setNote(null)}
              disabled={processing}
            />
          </View>
          {note && (
            <ScrollView contentContainerStyle={s.sheetBody}>
              <Text style={s.sheetTitle}>{note.title}</Text>
              {note.audioUri && <AudioPlayback uri={note.audioUri} />}
              <Text style={s.sourceText}>
                {note.text || "Your original audio is saved on this device."}
              </Text>
              {!!note.audioUri && !note.text && (
                <View>
                  {processing && <ActivityIndicator color={C.blue} />}
                  <Tap
                    label={
                      processing
                        ? "Transcribing…"
                        : note.captureKind && note.captureKind !== "thought"
                          ? "Transcribe recording"
                          : "Transcribe & shape"
                    }
                    primary
                    disabled={processing}
                    onPress={() => void processRecording(note, "library")}
                  />
                  {!!processingError && (
                    <Text style={s.error}>{processingError}</Text>
                  )}
                </View>
              )}
              {!!note.text &&
                note.captureKind !== "feedback" &&
                note.captureKind !== "note" && (
                  <Tap
                    label={
                      processing ? "Organizing…" : "Open as a visual draft"
                    }
                    primary
                    onPress={() => void processRecording(note, "library")}
                    disabled={busy || processing}
                  />
                )}
              {!!note.text && !!processingError && (
                <Text style={s.error}>{processingError}</Text>
              )}

              <Text style={s.meta}>Saved on this device</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={settings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettings(false)}
      >
        <SafeAreaView style={s.sheet}>
          <View style={s.sheetHead}>
            <Label>BEHIND THE SIMPLICITY</Label>
            <Tap label="Done" onPress={() => setSettings(false)} />
          </View>
          <ScrollView contentContainerStyle={s.sheetBody}>
            <Tap
              label="My profile & life map"
              onPress={() => {
                setSettings(false);
                navigate("Profile");
              }}
            />
            <Text style={s.sheetTitle}>A quieter kind{"\n"}of assistant.</Text>
            <Text style={s.body}>
              This is an early testing build. Your existing notes, recordings,
              tasks and calendar tools are preserved.
            </Text>
            <Tap
              label="Feedback about Flow"
              onPress={() => {
                setSettings(false);
                navigate("Feedback");
              }}
              primary
            />
            <Tap
              label="Open all task & calendar controls"
              onPress={() => {
                setSettings(false);
                setAdvanced(true);
              }}
            />
            <View style={s.source}>
              <Label>WORKING NOW</Label>
              <Text style={s.body}>
                Text capture · visual drafts · one-tap actions · local storage ·
                voice recording · local transcription · local AI drafts · Apple
                Calendar handoff
              </Text>
            </View>
            <View style={s.source}>
              <Label>NEXT TO CONNECT</Label>
              <Text style={s.body}>
                Connected AI accounts · smart follow-ups · connections across
                goals · reusable routines
              </Text>
            </View>
            <Text style={s.previewHint}>
              No paid AI service or cloud sync is connected. Website data and
              this app remain separate. Test build only.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <TaskDetail
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={saveWorkingTask}
        onComplete={finishWorkingTask}
        onCalendar={async (task) => {
          // Calendar receives exactly the task currently being edited.
          if (!task.plannedTime)
            throw new Error(
              "Choose a date and time in Calendar details first.",
            );
          const result = await addTaskToCalendar(task, choose);
          return result;
        }}
      />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { fontSize: 34, fontWeight: "800", letterSpacing: -2, color: C.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  test: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: C.muted },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
  },
  page: { padding: 24, paddingTop: 18, gap: 16, paddingBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: C.muted,
  },
  headline: {
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.8,
    fontWeight: "700",
    color: C.ink,
    marginTop: 12,
  },
  headingRow: { marginBottom: 10 },
  hero: {
    backgroundColor: C.ink,
    borderRadius: 28,
    padding: 24,
    gap: 16,
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroKicker: {
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: "700",
    color: "#C5CEDF",
  },
  heroArrow: { fontSize: 27, color: C.lime },
  heroTitle: {
    fontSize: 35,
    lineHeight: 40,
    letterSpacing: -1,
    fontWeight: "500",
    color: C.white,
  },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroSub: { fontSize: 14, lineHeight: 21, color: "#B8C3D8", flex: 1 },
  wave: { height: 50, flexDirection: "row", alignItems: "center", gap: 4 },
  captureRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primary: { backgroundColor: C.blue },
  secondary: { backgroundColor: C.soft },
  tapText: { fontSize: 14, fontWeight: "600", color: C.blue },
  sectionHead: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: C.ink,
  },
  meta: { fontSize: 12, lineHeight: 18, color: C.muted },
  draftCard: {
    backgroundColor: C.white,
    borderRadius: 23,
    padding: 21,
    gap: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: C.ink,
  },
  arrow: { fontSize: 24, color: C.blue },
  miniBranch: {
    borderLeftWidth: 1,
    borderLeftColor: C.line,
    marginLeft: 5,
    paddingLeft: 17,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  branchDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.blue,
    marginTop: 7,
  },
  body: { fontSize: 15, lineHeight: 23, color: C.muted, flexShrink: 1 },
  smallLink: {
    fontSize: 13,
    fontWeight: "600",
    color: C.blue,
    paddingVertical: 6,
  },
  emptyCard: {
    padding: 22,
    borderRadius: 23,
    backgroundColor: C.white,
    gap: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  emptySymbol: { fontSize: 50, color: C.blue },
  budgets: { flexDirection: "row", gap: 8, marginBottom: 2 },
  budget: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "#E9ECF2",
    minHeight: 44,
    justifyContent: "center",
  },
  budgetActive: { backgroundColor: C.ink },
  budgetText: { fontSize: 13, fontWeight: "600", color: C.muted },
  task: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#C6CFE0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
  },
  taskTitle: { fontSize: 16, lineHeight: 23, color: C.ink, fontWeight: "500" },
  quiet: { padding: 18, borderRadius: 18, backgroundColor: "#EBEEF4" },
  intro: { fontSize: 16, lineHeight: 25, color: C.muted, marginBottom: 8 },
  future: { paddingTop: 30, gap: 12 },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  noteIcon: {
    width: 46,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: "#8790A0",
    marginTop: 22,
    marginBottom: 10,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.paper,
  },
  navItem: { alignItems: "center", gap: 4, padding: 8, minWidth: 72 },
  navIcon: { fontSize: 22, color: "#9BA5B4" },
  navText: { fontSize: 11, color: C.muted },
  navCapture: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.blue,
  },
  sheet: { flex: 1, backgroundColor: C.paper },
  sheetHead: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sheetBody: { padding: 24, paddingTop: 10, paddingBottom: 45, gap: 20 },
  sheetTitle: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.2,
    fontWeight: "600",
    color: C.ink,
  },
  thoughtInput: {
    minHeight: 210,
    fontSize: 22,
    lineHeight: 33,
    color: C.ink,
    textAlignVertical: "top",
    paddingVertical: 12,
  },
  hintRow: { flexDirection: "row", justifyContent: "space-between" },
  previewHint: { fontSize: 12, lineHeight: 19, color: C.muted },
  treeRoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 12,
  },
  rootDot: {
    height: 15,
    width: 15,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: C.blue,
    backgroundColor: C.white,
  },
  treeRootText: { fontSize: 14, fontWeight: "600", color: C.ink },
  treeStem: {
    marginLeft: 7,
    borderLeftWidth: 1,
    borderColor: "#C8D0E0",
    paddingLeft: 22,
    gap: 20,
  },
  treeNode: {
    backgroundColor: C.white,
    padding: 20,
    borderRadius: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  treeConnector: {
    position: "absolute",
    top: 28,
    left: -23,
    width: 22,
    height: 1,
    backgroundColor: "#C8D0E0",
  },
  treeNodeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stepNumber: { fontSize: 15, color: C.blue, fontWeight: "600" },
  stepActions: { gap: 8 },
  accepted: { fontSize: 14, color: "#456822", fontWeight: "600" },
  source: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 12,
  },
  sourceText: { fontSize: 17, lineHeight: 28, color: C.ink },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: C.red,
    padding: 14,
    backgroundColor: "#FCEDED",
    borderRadius: 14,
  },
  notice: {
    fontSize: 14,
    lineHeight: 21,
    color: "#35542B",
    padding: 14,
    backgroundColor: "#EAF3DE",
    borderRadius: 14,
  },
  back: { padding: 14 },
  scrim: {
    flex: 1,
    backgroundColor: "#14213899",
    justifyContent: "center",
    padding: 24,
  },
  dialog: { padding: 24, borderRadius: 26, backgroundColor: C.paper, gap: 16 },
});
