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
import { journeyState, directionOptions } from "./src/journey";
import { starterFor, starterDraft } from "./src/starters";
import type { DirectionContext } from "./src/model";
import Onboarding from "./src/components/Onboarding";
import { loadProfile, saveProfile } from "./src/services/profile";
import { productivityGuide, newProfile, type Profile } from "./src/personality";
import DraftReview from "./src/components/DraftReview";
import {
  processVoiceNote,
  createThoughtDraft,
  organizeThought,
} from "./src/services/processing";
import { loadDrafts, saveDraft, acceptStep } from "./src/services/drafts";
import {
  suggestDraft,
  refineDraft,
  exampleDraft,
  type ThoughtDraft,
  type DraftStep,
} from "./src/drafts";
import { localDate, todayTasks, type Task, type Note } from "./src/model";
import {
  addTaskToCalendar,
  type ChooseCalendar,
} from "./src/services/calendar";

type Screen = "Today" | "My mind" | "Library" | "Profile";
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
function Wave() {
  return (
    <View accessibilityElementsHidden style={s.wave}>
      {[12, 26, 18, 36, 48, 30, 20, 40, 28, 16, 34, 22].map((h, i) => (
        <View
          key={i}
          style={{
            height: h,
            width: 3,
            borderRadius: 3,
            backgroundColor: C.lime,
            opacity: 0.5 + (i % 3) * 0.2,
          }}
        />
      ))}
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Flow />
    </SafeAreaProvider>
  );
}
function Flow() {
  const [screen, setScreen] = useState<Screen>("Today");
  const [profile, setProfile] = useState<Profile>(newProfile());
  const [onboarding, setOnboarding] = useState(false);
  const [captureTopic, setCaptureTopic] = useState("");
  const [ready, setReady] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drafts, setDrafts] = useState<ThoughtDraft[]>([]);
  const [budget, setBudget] = useState(30);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [composer, setComposer] = useState<"text" | "voice" | null>(null);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
    if (pendingDraft.current) {
      setSelected(pendingDraft.current);
      pendingDraft.current = null;
    }
  }
  function revealDraftAfterSheet(id: string) {
    if (Platform.OS === "ios") pendingDraft.current = id;
    else setSelected(id);
  }
  const [parked, setParked] = useState(false);
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const contentScroll = useRef<ScrollView>(null);
  function navigate(next: Screen) {
    setScreen(next);
    setNotice("");
    setError("");
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }
  async function refresh() {
    const [w, d] = await Promise.all([loadWorkspace(), loadDrafts()]);
    setTasks(w.tasks);
    setNotes(w.notes);
    setDrafts(d);
  }
  useEffect(() => {
    Promise.all([
      refresh(),
      loadProfile().then((p) => {
        setProfile(p);
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
  ) {
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
        title: text.slice(0, 80),
        text,
        createdAt: new Date().toISOString(),
      };
      await saveNote(n);
      const prior = drafts.find((d) => d.id === refining);
      const d = prior
        ? refineDraft(prior, text)
        : await createThoughtDraft(id, text, n.direction);
      await saveDraft(d);
      revealDraftAfterSheet(d.id);
      setComposer(null);
      setInput("");
      setNotice(
        prior
          ? "Update saved to this draft."
          : "Thought saved. Your draft is ready to shape.",
      );
    });
  }
  async function voiceSaved(v: SavedVoiceNote) {
    // Registration alone decides whether recording saved successfully.
    await registerVoiceNote({
      ...v,
      direction: captureDirection.current,
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
      const draft = await processVoiceNote(entry);
      await refresh();
      revealDraftAfterSheet(draft.id);
      if (origin === "capture") setComposer(null);
      else setNote(null);
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
      id: saved.audioUri,
      createdAt: new Date().toISOString(),
    };
    setVoiceBusy(false);
    setVoiceResult(entry);
    void processRecording(entry, "capture");
  }
  const journey = journeyState(profile, notes, drafts, tasks);
  const next = journey.next;
  const suggestedStarter = next.direction ? starterFor(next.direction) : null;
  const nextTask =
    next.kind === "task" ? tasks.find((t) => t.id === next.id) : undefined;
  async function updateProfile(p: Profile) {
    await saveProfile(p);
    setProfile(p);
  }
  function continueJourney() {
    navigate("Today");
    if (next.kind === "setup") {
      setOnboarding(true);
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
      await updateProfile({ ...profile, completed: true });
      setOnboarding(false);
      navigate("Today");
      setNotice("Your first action is ready. Everything else stays saved.");
    });
  }
  function guidedCapture(direction: DirectionContext) {
    setOnboarding(false);
    capture(
      "voice",
      null,
      `What is already happening with ${direction.choice.toLowerCase()}? Mention any actual date or person involved.`,
      direction,
    );
  }
  const current = drafts.find((d) => d.id === selected);
  const activeDrafts = drafts.filter((d) => d.state === "draft");
  const day = todayTasks(tasks, budget);
  const today = localDate();
  const done = tasks.filter((t) => t.done && t.plannedDate === today).length;
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
  async function calendar(t: Task) {
    if (!t.plannedTime) {
      setCalendarTask(t);
      return;
    }
    await run(async () => setNotice(await addTaskToCalendar(t, choose)));
  }
  async function scheduleTomorrow() {
    if (!calendarTask) return;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const t = {
      ...calendarTask,
      plannedDate: localDate(date),
      plannedTime: "09:00",
    };
    await run(async () => {
      await saveTask(t);
      const result = await addTaskToCalendar(t, choose);
      setCalendarTask(null);
      setNotice(result);
    });
  }
  async function add(d: ThoughtDraft, step: DraftStep) {
    await run(async () => {
      await acceptStep(d, step);
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
            .slice(0, Math.max(0, 3 - preserved.length))
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
  async function explore() {
    await run(async () => {
      const existing = drafts.find((d) => d.example);
      if (existing) {
        setSelected(existing.id);
        return;
      }
      const d = exampleDraft(randomUUID());
      await saveDraft(d);
      setSelected(d.id);
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
          onSave={async (p) => {
            await saveProfile(p);
            setProfile(p);
          }}
          onClose={() => setOnboarding(false)}
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
            navigate("Today");
          }}
          externalBusy={busy}
          externalError={error}
          existingWork={
            notes.length > 0 ||
            drafts.some((d) => !d.example) ||
            tasks.length > 0
          }
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
          <Text style={s.test}>TEST BUILD · 08</Text>
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
          {screen === "Today" && (
            <>
              <View style={s.headingRow}>
                <View>
                  <Label>
                    {new Date().toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </Label>
                  <Text style={s.headline}>
                    Make room{"\n"}for what matters.
                  </Text>
                </View>
              </View>
              <View style={s.hero}>
                <Text style={s.heroKicker}>
                  {next.direction?.choice.toUpperCase() ?? "YOUR NEXT STEP"}
                </Text>
                <Text style={s.heroTitle}>
                  {next.kind === "starter"
                    ? suggestedStarter?.title
                    : next.kind === "task"
                      ? nextTask?.title
                      : next.title}
                </Text>
                <Text style={s.heroSub}>
                  {next.kind === "starter"
                    ? suggestedStarter?.why
                    : next.kind === "process"
                      ? "Your saved words come first. Resume processing below; no need to repeat yourself."
                      : next.kind === "draft"
                        ? "Your draft is saved. Choose its first useful action."
                        : next.kind === "task"
                          ? "This is the action you chose. Finish it before opening another direction."
                          : next.kind === "complete"
                            ? journey.milestones.some(
                                (m) =>
                                  m.label === "First action completed" &&
                                  m.done,
                              )
                              ? "Your chosen action is complete. Your profile keeps the progress."
                              : "Your life areas are reviewed. You can add an interest in Profile when you need it."
                            : "We’ll use your saved answers and build a first plan."}
                </Text>
                {next.kind === "starter" && next.direction && (
                  <Tap
                    label="Use this first step"
                    onPress={() => void useStarter(next.direction!)}
                    disabled={busy}
                    primary
                  />
                )}
                {next.kind === "task" && nextTask && (
                  <Tap
                    label="I’ve done this"
                    onPress={() =>
                      void run(async () => {
                        await saveTask({ ...nextTask, done: true });
                        setNotice(
                          "First action complete. Your progress is saved in Profile.",
                        );
                      })
                    }
                    disabled={busy}
                    primary
                  />
                )}
                {["setup", "draft", "process"].includes(next.kind) && (
                  <Tap
                    label={
                      next.kind === "draft"
                        ? "Review my saved draft"
                        : next.kind === "process"
                          ? "Resume my saved thought"
                          : "Continue my setup"
                    }
                    onPress={continueJourney}
                    disabled={busy}
                    primary
                  />
                )}
                {next.kind === "complete" && (
                  <Tap
                    label="See my progress"
                    onPress={() => navigate("Profile")}
                    primary
                  />
                )}
              </View>
              {next.kind === "starter" && next.direction && (
                <Tap
                  label="Use my own details instead"
                  onPress={() => guidedCapture(next.direction!)}
                  disabled={busy}
                />
              )}
              {next.kind === "task" && nextTask && (
                <Tap
                  label="Add this action to Calendar"
                  onPress={() => void calendar(nextTask)}
                  disabled={busy}
                />
              )}
              <View style={s.captureRow}>
                <Tap
                  label="Capture another thought"
                  onPress={() => capture("voice")}
                />
                <Tap label="My profile" onPress={() => navigate("Profile")} />
              </View>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>Within reach today</Text>
                <Text style={s.meta}>
                  {done ? `${done} done` : "Keep it light"}
                </Text>
              </View>
              <View style={s.budgets}>
                {[10, 30, 60].map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: budget === m }}
                    onPress={() => setBudget(m)}
                    style={[s.budget, budget === m && s.budgetActive]}
                  >
                    <Text
                      style={[s.budgetText, budget === m && { color: C.white }]}
                    >
                      {m} min
                    </Text>
                  </Pressable>
                ))}
              </View>
              {day
                .filter((t) => t.id !== nextTask?.id)
                .slice(0, 3)
                .map((t) => (
                  <View key={t.id} style={s.task}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: t.done }}
                      accessibilityLabel={`Complete ${t.title}`}
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await saveTask({ ...t, done: true });
                          setNotice("Done. A little more space.");
                        })
                      }
                      style={s.check}
                    >
                      <Text style={{ color: C.blue }}>○</Text>
                    </Pressable>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={s.taskTitle}>{t.title}</Text>
                      <Text style={s.meta}>
                        {t.minutes} min · {t.topic}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void calendar(t)}
                      >
                        <Text style={s.smallLink}>Add to Calendar ↗</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              {!day.length && (
                <View style={s.quiet}>
                  <Text style={s.body}>
                    Nothing needs to fill this space.{"\n"}Pick a step from a
                    draft when you’re ready.
                  </Text>
                </View>
              )}
              {day.length > 3 && (
                <Pressable onPress={() => setAdvanced(true)}>
                  <Text style={s.smallLink}>
                    See the rest in your task list →
                  </Text>
                </Pressable>
              )}
            </>
          )}
          {screen === "Profile" && (
            <ProfileView
              profile={profile}
              notes={notes}
              drafts={drafts}
              tasks={tasks}
              busy={busy}
              onContinue={continueJourney}
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
                    focusExplicit: true,
                  });
                  navigate("Today");
                })
              }
            />
          )}
          {screen === "My mind" && (
            <>
              <Label>MY MIND · THE BIGGER PICTURE</Label>
              <Text style={s.headline}>Room to{"\n"}think.</Text>
              <Text style={s.intro}>
                Ideas can stay ideas. Open one when it’s ready to become
                something.
              </Text>
              <View style={s.budgets}>
                {["In motion", "Parked"].map((x, i) => (
                  <Pressable
                    key={x}
                    accessibilityRole="button"
                    onPress={() => setParked(!!i)}
                    style={[s.budget, parked === !!i && s.budgetActive]}
                  >
                    <Text
                      style={[
                        s.budgetText,
                        parked === !!i && { color: C.white },
                      ]}
                    >
                      {x}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {drafts
                .filter((d) => (d.state === "parked") === parked)
                .map((d) => (
                  <Pressable
                    key={d.id}
                    accessibilityRole="button"
                    onPress={() => setSelected(d.id)}
                    style={s.draftCard}
                  >
                    <View style={s.rowBetween}>
                      <Label>
                        {d.example ? "EXAMPLE" : d.topic.toUpperCase()}
                      </Label>
                      <Text style={s.arrow}>↗</Text>
                    </View>
                    <Text style={s.cardTitle}>{d.title}</Text>
                    <View style={s.miniBranch}>
                      <View style={s.branchDot} />
                      <Text style={s.body}>
                        {d.steps.filter((x) => x.accepted).length} chosen ·{" "}
                        {d.steps.filter((x) => !x.accepted).length}{" "}
                        possibilities
                      </Text>
                    </View>
                  </Pressable>
                ))}
              {!drafts.filter((d) => (d.state === "parked") === parked)
                .length && (
                <View style={s.emptyCard}>
                  <Text style={s.cardTitle}>
                    {parked
                      ? "Quietly kept for later."
                      : "Your thoughts belong here."}
                  </Text>
                  <Text style={s.body}>
                    {parked
                      ? "Park a draft to take it off your daily view."
                      : "Start with a thought. You don’t need a project name or a plan."}
                  </Text>
                  <Tap
                    label={
                      parked ? "Capture something new" : "Explore an example"
                    }
                    onPress={() => (parked ? capture("text") : void explore())}
                  />
                </View>
              )}
              <View style={s.future}>
                <Label>ON THE HORIZON</Label>
                <Text style={s.body}>
                  Connections between goals. Reusable routines. A wider view
                  when you want it.
                </Text>
                <Text style={s.meta}>
                  Preview of direction · not connected yet
                </Text>
              </View>
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
              {notes.map((n) => (
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
              {!notes.length && (
                <View style={s.emptyCard}>
                  <Text style={s.cardTitle}>A fresh page.</Text>
                  <Text style={s.body}>
                    Speak or write. We’ll keep the original here.
                  </Text>
                  <Tap
                    label="Capture a thought"
                    onPress={() => capture("text")}
                    primary
                  />
                </View>
              )}
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
          accessibilityLabel="Capture a thought"
          onPress={() => capture("text")}
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
              <Label>{refining ? "CONTINUE THIS THOUGHT" : "LET IT OUT"}</Label>
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
                          ? "Turning your words into a draft…"
                          : "Recording saved."}
                      </Text>
                      {processing ? (
                        <ActivityIndicator color={C.blue} />
                      ) : (
                        <AudioPlayback uri={voiceResult.audioUri!} />
                      )}
                      <Text style={s.body}>
                        {processing
                          ? "Transcribing on your Mac mini. Your original audio is already safe on this phone."
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
                    Stop once. We save the audio, transcribe it on your Mac
                    mini, and open a draft here. Keep both devices on the same
                    Wi-Fi.
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
                      refining
                        ? "What changed? What else is on your mind?"
                        : "An idea, a loose end, something you want to do…"
                    }
                    placeholderTextColor="#8D95A4"
                    accessibilityLabel="Your thought"
                    style={s.thoughtInput}
                  />
                  <View style={s.hintRow}>
                    <Text style={s.meta}>Your words are enough.</Text>
                    <Text style={s.meta}>{input.length}/20,000</Text>
                  </View>
                  <Tap
                    label={
                      busy
                        ? "Making sense of it…"
                        : refining
                          ? "Add to this draft  ↗"
                          : "Shape this thought  ↗"
                    }
                    primary
                    disabled={busy || !input.trim()}
                    onPress={() => void submit()}
                  />
                  <Text style={s.previewHint}>
                    Flow can organize this privately on your Mac mini. Your
                    original words are always kept.
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
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={s.sheet}>
          <View style={s.sheetHead}>
            <Label>
              {current?.example ? "EXAMPLE · TRY THE FLOW" : "A WORKING DRAFT"}
            </Label>
            <Tap
              label="Done"
              onPress={() => setSelected(null)}
              disabled={busy}
            />
          </View>
          {current && (
            <DraftReview
              presentation={profile.presentation}
              key={current.id}
              draft={current}
              busy={busy}
              organizing={organizing}
              onChoose={(step, smaller) =>
                chooseDraftStep(current, step, smaller)
              }
              onDefer={(step, deferred) =>
                deferDraftStep(current, step, deferred)
              }
              onOrganize={() => void organizeCurrent(current)}
              onClose={() => setSelected(null)}
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
            <Label>ORIGINAL THOUGHT</Label>
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
                    label={processing ? "Transcribing…" : "Transcribe & shape"}
                    primary
                    disabled={processing}
                    onPress={() => void processRecording(note, "library")}
                  />
                  {!!processingError && (
                    <Text style={s.error}>{processingError}</Text>
                  )}
                </View>
              )}
              {!!note.text && (
                <Tap
                  label={processing ? "Organizing…" : "Open as a visual draft"}
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
      <Modal
        transparent
        visible={!!calendarTask}
        animationType="fade"
        onRequestClose={() => setCalendarTask(null)}
      >
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Label>MAKE A LITTLE SPACE</Label>
            <Text style={s.cardTitle}>{calendarTask?.title}</Text>
            <Text style={s.body}>
              This action needs a time before it can go into Calendar.
              Suggested: tomorrow at 9:00 AM, with a 15-minute alert.
            </Text>
            <Tap
              label="Use tomorrow at 9:00"
              primary
              onPress={() => void scheduleTomorrow()}
              disabled={busy}
            />
            <Tap
              label="Choose another time"
              onPress={() => {
                setCalendarTask(null);
                setAdvanced(true);
              }}
              disabled={busy}
            />
            <Tap
              label="Not now"
              onPress={() => setCalendarTask(null)}
              disabled={busy}
            />
            {!!error && <Text style={s.error}>{error}</Text>}
          </View>
        </View>
      </Modal>
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
