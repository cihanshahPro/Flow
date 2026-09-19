import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import VoiceCapture, { AudioPlayback, type SavedVoiceNote } from "./src/components/VoiceCapture";
import Today from "./src/components/Today";
import Threads from "./src/components/Threads";
import Progress from "./src/components/Progress";
import Profile from "./src/components/Profile";
import TabBar, { type Tab } from "./src/components/TabBar";
import ThreadChat from "./src/components/ThreadChat";
import Funnel, { type FunnelStep } from "./src/components/Funnel";
import { C } from "./src/components/theme";
import { loadWorkspace, saveNote, registerVoiceNote, saveTask } from "./src/services/storage";
import { loadDrafts, saveDraft, acceptStep } from "./src/services/drafts";
import { loadProfile, saveProfile } from "./src/services/profile";
import { syncProgress } from "./src/services/progress";
import { processCapturedNote } from "./src/services/processing";
import { syncReminders } from "./src/services/reminders";
import { addTaskToCalendar, type ChooseCalendar } from "./src/services/calendar";
import { newProfile, FUNNEL_VERSION, type Profile as ProfileModel } from "./src/personality";
import { newProgress, levelForProgress } from "./src/progress";
import { completeTask } from "./src/task-flow";
import { flowType, modeFor, DEFAULT_MODE } from "./src/flow-voice";
import { answerChip, backfillConversation, evaluateThread, noteLevelUp, noteMoveDone, pendingMessage, plannedDateFor, suggestPrompt, threadTasks } from "./src/thread";
import type { ThoughtDraft } from "./src/drafts";
import type { Note, Task } from "./src/model";

type Screen = Tab | "thread";
type Capture = { mode: "voice" | "text"; threadId: string | null; kind: "thought" | "feedback"; prompt?: string };
const EVALUATE_EVERY_MS = 15 * 60 * 1000;

export default function App() {
  return (
    <SafeAreaProvider>
      <Flow />
    </SafeAreaProvider>
  );
}

function pendingQuestion(thread: ThoughtDraft): string | undefined {
  const open = [...(thread.messages ?? [])].reverse().find((m) => m.from === "flow" && !m.answered && m.kind === "question");
  return open ? `Flow asked: ${open.text}` : undefined;
}

function Flow() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ProfileModel>(newProfile());
  const [progress, setProgress] = useState(newProgress());
  const [threads, setThreads] = useState<ThoughtDraft[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [screen, setScreen] = useState<Screen>("today");
  const [lastTab, setLastTab] = useState<Tab>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [funnel, setFunnel] = useState(false);
  const [funnelStep, setFunnelStep] = useState<FunnelStep>("intro");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [input, setInput] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceResult, setVoiceResult] = useState<Note | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const processingLock = useRef(false);
  const captureId = useRef("");
  const revealAfterSheet = useRef<string | null>(null);

  const mode = modeFor(profile.answers) ?? DEFAULT_MODE;
  const current = threads.find((t) => t.id === openId);
  const level = levelForProgress(progress);
  const type = flowType(profile.answers);
  const nextTask =
    tasks.find((t) => t.id === profile.activeTaskId && !t.done) ??
    [...tasks].filter((t) => !t.done && t.id.startsWith("flow:")).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const nextThread = nextTask ? threads.find((t) => nextTask.id.startsWith(`flow:${t.id}:`)) : undefined;

  async function refresh() {
    const [w, d] = await Promise.all([loadWorkspace(), loadDrafts()]);
    setTasks(w.tasks);
    setNotes(w.notes);
    setThreads(d);
    try {
      setProgress(await syncProgress());
    } catch {
      /* Levels catch up on the next sync; nothing else is blocked. */
    }
    return { tasks: w.tasks, threads: d };
  }

  /** Flow re-reads every open thread and adds a check-in where one is due. */
  async function evaluateAll(source?: { tasks: Task[]; threads: ThoughtDraft[] }) {
    // Always read what is saved, never a possibly stale render snapshot.
    const data = source ?? { tasks: (await loadWorkspace()).tasks, threads: await loadDrafts() };
    let changed = false;
    for (const thread of data.threads) {
      // Threads from older builds get their conversation first, then the usual check-ins.
      const next = evaluateThread(backfillConversation(thread, { mode, plate: profile.plate }), data.tasks, { mode });
      if (next !== thread) {
        await saveDraft(next);
        changed = true;
      }
    }
    if (changed) await refresh();
    void syncReminders(data.threads, data.tasks).catch(() => {});
  }

  useEffect(() => {
    Promise.all([refresh(), loadProfile()])
      .then(async ([data, p]) => {
        setProfile(p);
        // Every device goes through the build-12 funnel once, from the top, whatever an older build saved.
        setFunnel(p.funnelVersion !== FUNNEL_VERSION);
        setFunnelStep("intro");
        await evaluateAll(data);
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Flow could not open its saved data.");
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void evaluateAll().catch(() => {});
    });
    const timer = setInterval(() => void evaluateAll().catch(() => {}), EVALUATE_EVERY_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [ready, mode]);

  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Your saved thoughts are safe.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function updateProfile(p: ProfileModel) {
    await saveProfile(p);
    setProfile(p);
  }

  /** Levels are announced inside the thread that earned them. */
  async function announceLevel(threadId: string | undefined, before: number) {
    const after = await syncProgress().catch(() => null);
    if (!after) return;
    setProgress(after);
    const summary = levelForProgress(after);
    if (!threadId || !summary.level || summary.level.number <= before) return;
    const thread = (await loadDrafts()).find((t) => t.id === threadId);
    if (!thread) return;
    const next = noteLevelUp(thread, summary.level.title, mode);
    if (next !== thread) {
      await saveDraft(next);
      await refresh();
    }
  }

  function openThread(id: string) {
    setOpenId(id);
    setScreen("thread");
    setNotice("");
    setError("");
    setProcessingError("");
    void evaluateAll().catch(() => {});
  }
  function closeThread() {
    setScreen(lastTab);
    setOpenId(null);
  }
  function selectTab(tab: Tab) {
    setLastTab(tab);
    setScreen(tab);
    setNotice("");
    setError("");
  }

  function startCapture(
    mode: "voice" | "text",
    threadId: string | null,
    kind: "thought" | "feedback" = "thought",
    prompt?: string,
  ) {
    captureId.current = randomUUID();
    setInput("");
    setVoiceResult(null);
    setProcessingError("");
    setCaptureVisible(false);
    setNotice("");
    setCapture({ mode, threadId, kind, prompt });
  }
  function closeCapture() {
    if (!voiceBusy && !busy && !processing) setCapture(null);
  }
  function finishSheetTransition() {
    if (revealAfterSheet.current) {
      openThread(revealAfterSheet.current);
      revealAfterSheet.current = null;
    }
  }
  function reveal(id: string) {
    if (Platform.OS === "ios" && capture) revealAfterSheet.current = id;
    else openThread(id);
  }

  async function voiceSaved(v: SavedVoiceNote) {
    await registerVoiceNote({
      ...v,
      planId: capture?.kind === "thought" ? capture.threadId ?? undefined : undefined,
      captureKind: capture?.kind === "feedback" ? "feedback" : v.captureKind ?? "thought",
      id: v.audioUri,
      createdAt: new Date().toISOString(),
    });
  }
  function recordingCompleted(saved: SavedVoiceNote) {
    const entry: Note = {
      ...saved,
      planId: capture?.kind === "thought" ? capture.threadId ?? undefined : undefined,
      captureKind: capture?.kind === "feedback" ? "feedback" : "thought",
      id: saved.audioUri,
      createdAt: new Date().toISOString(),
    };
    setVoiceBusy(false);
    setVoiceResult(entry);
    void processRecording(entry);
  }
  async function processRecording(entry: Note) {
    if (processingLock.current) return;
    processingLock.current = true;
    setProcessing(true);
    setProcessingError("");
    const before = level.level?.number ?? 0;
    try {
      const result = await processCapturedNote(entry);
      const data = await refresh();
      if (result.kind === "note") {
        setCapture(null);
        setNotice("Saved. Thank you — it stays on this phone.");
        return;
      }
      setCapture(null);
      if (openId !== result.draft.id) reveal(result.draft.id);
      await evaluateAll(data);
      await announceLevel(result.draft.id, before);
    } catch (failure) {
      setProcessingError(failure instanceof Error ? failure.message : "Processing paused. Your recording is saved.");
      await refresh().catch(() => {});
    } finally {
      processingLock.current = false;
      setProcessing(false);
    }
  }
  async function submitText() {
    const text = input.trim();
    if (!text || !capture) return;
    await run(async () => {
      const id = captureId.current || randomUUID();
      const n: Note = {
        id,
        planId: capture.kind === "thought" ? capture.threadId ?? undefined : undefined,
        captureKind: capture.kind,
        title: text.slice(0, 80),
        text,
        createdAt: new Date().toISOString(),
      };
      await saveNote(n);
      setInput("");
      await processRecording(n);
    });
  }

  function chip(messageId: string, chipId: string) {
    if (!current) return;
    void run(async () => {
      const before = level.level?.number ?? 0;
      const { thread, effects } = answerChip(current, messageId, chipId, { mode, plate: profile.plate });
      await saveDraft(thread);
      for (const effect of effects) {
        if (effect.type === "accept") {
          const step = thread.steps.find((s) => s.id === effect.stepId);
          if (step) {
            await acceptStep(thread, step);
            // The move is an if-then plan: it lands on the day the person said they have time.
            const id = `flow:${thread.id}:${step.id}`;
            const saved = (await loadWorkspace()).tasks.find((t) => t.id === id);
            if (saved) await saveTask({ ...saved, plannedDate: plannedDateFor(profile.plate?.timeWindow) });
            await updateProfile({ ...profile, activeTaskId: id });
          }
        } else if (effect.type === "complete") {
          const task = tasks.find((t) => t.id === effect.taskId);
          if (task && !task.done) await saveTask(completeTask(task));
        }
      }
      await refresh();
      await announceLevel(thread.id, before);
    });
  }

  function doneNext() {
    if (!nextTask) return;
    void run(async () => {
      const before = level.level?.number ?? 0;
      await saveTask(completeTask(nextTask));
      const thread = nextThread ? (await loadDrafts()).find((t) => t.id === nextThread.id) : undefined;
      if (thread) await saveDraft(noteMoveDone(thread, nextTask, { mode, plate: profile.plate }));
      if (profile.activeTaskId === nextTask.id) await updateProfile({ ...profile, activeTaskId: undefined });
      await refresh();
      await announceLevel(thread?.id, before);
      setNotice(thread ? `Done. Flow left you a note in “${thread.title}”.` : "Done.");
    });
  }
  const choose: ChooseCalendar = (options, preferred) =>
    new Promise((resolve) =>
      Alert.alert(
        "Choose your calendar",
        "Flow remembers this for next time.",
        [
          ...options.map((c) => ({ text: c.title + (c.id === preferred ? " · default" : ""), onPress: () => resolve(c.id) })),
          { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        ],
        { cancelable: false },
      ),
    );
  function calendarNext() {
    if (!nextTask) return;
    void run(async () => {
      const message = await addTaskToCalendar(nextTask, choose);
      setNotice(message);
    });
  }

  const captureTitle =
    capture?.kind === "feedback"
      ? "Tell Flow something"
      : capture?.threadId
        ? current?.title ?? "Add to this thread"
        : capture?.prompt
          ? "Flow is listening"
          : "What's on your mind?";
  const captureHint =
    capture?.kind === "feedback"
      ? "About Flow itself. It stays here and never becomes a thread."
      : capture?.prompt ?? (capture?.threadId ? "Just answer or add. Flow keeps the thread." : "Say everything about one thing. Don't organise it.");
  const captureSheet = (
      <Modal
        visible={capture !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCapture}
        onShow={() => setCaptureVisible(true)}
        onDismiss={finishSheetTransition}
      >
        <SafeAreaView style={s.sheet}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View style={s.sheetHead}>
              <Text style={s.kicker} numberOfLines={1}>
                {capture?.kind === "feedback" ? "FEEDBACK" : capture?.threadId ? "THIS THREAD" : "NEW"}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeCapture} disabled={voiceBusy || busy || processing} hitSlop={12}>
                <Text style={s.link}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={s.sheetTitle}>{captureTitle}</Text>
              <Text style={s.body}>{captureHint}</Text>
              {capture?.mode === "voice" ? (
                <>
                  {voiceResult ? (
                    <View style={s.card}>
                      <Text style={s.cardTitle}>{processing ? "Saved. Flow is listening back…" : "Recording saved."}</Text>
                      {processing ? <ActivityIndicator color={C.blue} /> : <AudioPlayback uri={voiceResult.audioUri!} />}
                      <Text style={s.body}>
                        {processing ? "Your audio is already safe on this phone. Transcribing on your Mac mini." : processingError}
                      </Text>
                      {!processing && (
                        <Pressable accessibilityRole="button" accessibilityLabel="Retry processing" onPress={() => void processRecording(voiceResult)} style={s.primary}>
                          <Text style={s.primaryText}>Retry</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <VoiceCapture compact autoStart={captureVisible} onActivityChange={setVoiceBusy} onSaved={voiceSaved} onComplete={recordingCompleted} />
                  )}
                  {!voiceBusy && !voiceResult && (
                    <Pressable accessibilityRole="button" accessibilityLabel="Write instead" onPress={() => setCapture({ ...capture, mode: "text" })} hitSlop={8} style={{ alignSelf: "center" }}>
                      <Text style={s.link}>or write it down</Text>
                    </Pressable>
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
                    editable={!busy && !processing}
                    placeholder={capture?.kind === "feedback" ? "What were you trying to do? What felt confusing or useful?" : "Your words are enough."}
                    placeholderTextColor={C.faint}
                    accessibilityLabel={capture?.kind === "feedback" ? "Your feedback" : "Your thought"}
                    style={s.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={capture?.kind === "feedback" ? "Save feedback" : "Send to Flow"}
                    onPress={() => void submitText()}
                    disabled={busy || processing || !input.trim()}
                    style={({ pressed }) => [s.primary, (pressed || busy || processing || !input.trim()) && { opacity: 0.55 }]}
                  >
                    <Text style={s.primaryText}>{processing ? "Flow is reading…" : capture?.kind === "feedback" ? "Save feedback" : "Send to Flow"}</Text>
                  </Pressable>
                  {!!processingError && <Text style={s.error}>{processingError}</Text>}
                  {!processing && (
                    <Pressable accessibilityRole="button" accessibilityLabel="Speak instead" onPress={() => capture && setCapture({ ...capture, mode: "voice" })} hitSlop={8} style={{ alignSelf: "center" }}>
                      <Text style={s.link}>or record instead</Text>
                    </Pressable>
                  )}
                </>
              )}
              {!!error && <Text style={s.error}>{error}</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
  );

  if (!ready)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loading}>
          <Text style={s.brand}>flow.</Text>
          {error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={C.blue} />}
        </View>
      </SafeAreaView>
    );

  if (funnel) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <Funnel
          profile={profile}
          step={funnelStep}
          onStep={setFunnelStep}
          busy={busy}
          error={error}
          onSave={(p) => run(() => updateProfile(p))}
          onFinish={(p) =>
            run(async () => {
              await updateProfile(p);
              setProgress(await syncProgress().catch(() => progress));
              setFunnel(false);
              selectTab("today");
            })
          }
          onRecordFirst={(prompt) => startCapture("voice", null, "thought", prompt)}
          onWriteFirst={(prompt) => startCapture("text", null, "thought", prompt)}
        />
        {captureSheet}
      </SafeAreaView>
    );
  }

  const suggestion = suggestPrompt(profile.plate, threads);

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {screen === "today" && (
          <Today
            threads={threads}
            tasks={tasks}
            nextTask={nextTask}
            nextThread={nextThread}
            levelLabel={level.level ? level.level.title : type ? type.name : "Level"}
            suggestion={suggestion}
            busy={busy}
            notice={notice}
            error={error}
            onRecord={() => startCapture("voice", null, "thought", suggestion.prompt)}
            onWrite={() => startCapture("text", null, "thought", suggestion.prompt)}
            onRecordOther={() => startCapture("voice", null, "thought", "Something else that's on your mind. Say where it stands, what you'd want out of it, who's involved, what's in the way.")}
            onOpenThread={openThread}
            onDoneNext={doneNext}
            onCalendarNext={calendarNext}
            onOpenMe={() => selectTab("progress")}
            onDismissNotice={() => {
              setNotice("");
              setError("");
            }}
          />
        )}
        {screen === "threads" && (
          <Threads threads={threads} tasks={tasks} busy={busy} onOpenThread={openThread} onNew={() => startCapture("voice", null, "thought", suggestion.prompt)} />
        )}
        {screen === "progress" && <Progress progress={progress} threads={threads} />}
        {screen === "profile" && (
          <Profile
            profile={profile}
            threads={threads}
            notes={notes}
            busy={busy}
            onRetake={() =>
              void run(async () => {
                await updateProfile({ ...profile, answers: [], funnelVersion: undefined });
                setFunnelStep("intro");
                setFunnel(true);
              })
            }
            onFeedback={(m) => startCapture(m, null, "feedback")}
            onPlate={(plate) => void run(() => updateProfile({ ...profile, plate }))}
          />
        )}
        {screen === "thread" && current && (
          <ThreadChat
            thread={current}
            tasks={tasks}
            notes={notes}
            mode={mode}
            busy={busy}
            processing={processing && !capture}
            error={error || processingError}
            onRecord={() => startCapture("voice", current.id, "thought", pendingQuestion(current))}
            onWrite={() => startCapture("text", current.id, "thought", pendingQuestion(current))}
            onChip={chip}
            onClose={closeThread}
          />
        )}
        {screen === "thread" && !current && (
          <View style={s.loading}>
            <Text style={s.body}>That thread is no longer here.</Text>
            <Pressable accessibilityRole="button" onPress={closeThread}>
              <Text style={s.link}>Back</Text>
            </Pressable>
          </View>
        )}
      </View>
      {screen !== "thread" && (
        <TabBar
          active={screen}
          badge={threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt && pendingMessage(t)).length}
          onSelect={selectTab}
        />
      )}
      {captureSheet}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  brand: { fontSize: 34, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
  sheet: { flex: 1, backgroundColor: C.paper },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  sheetTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: C.ink },
  kicker: { fontSize: 11, letterSpacing: 1.4, fontWeight: "700", color: C.muted },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 6 },
  card: { padding: 16, borderRadius: 18, backgroundColor: C.white, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: C.ink },
  input: { minHeight: 160, padding: 16, borderRadius: 18, backgroundColor: C.white, fontSize: 17, lineHeight: 24, color: C.ink, textAlignVertical: "top" },
  primary: { backgroundColor: C.blue, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: C.white, fontSize: 16, fontWeight: "700" },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
});
