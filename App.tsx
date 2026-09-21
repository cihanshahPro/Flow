import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import RecordingPage from "./src/components/RecordingPage";
import CalendarTab from "./src/components/CalendarTab";
import Me from "./src/components/Me";
import MoveSheet from "./src/components/MoveSheet";
import PlanTomorrow from "./src/components/PlanTomorrow";
import { dayPlanFor, loadRoutines, lockTomorrow, proposal as loadProposal, startDay, suggestForTomorrow } from "./src/services/tomorrow";
import { morningLine, tomorrowOf, type Decision, type Proposal, type Routine } from "./src/tomorrow";
import * as Notifications from "expo-notifications";
import TabBar, { type Tab } from "./src/components/TabBar";
import ThreadChat from "./src/components/ThreadChat";
import WeekPlan from "./src/components/WeekPlan";
import type { WeekPlan as Plan } from "./src/services/intake";
import { calendarConnected, connectCalendar, connectReminders, listCalendars, readWeek, remindersConnected, removeAllFlowItems, seedDemoCalendar, setCalendarOn, type PhoneCalendar } from "./src/services/calendar-read";
import { deleteMove, editMove, moveToEvening, moveToTomorrow, replanConflicts, syncFromPhone, tickMove, untickMove } from "./src/services/moves";
import { watchOuts, type CalEvent } from "./src/calendar";
import Thinking from "./src/components/Thinking";
import Funnel, { type FunnelStep } from "./src/components/Funnel";
import { C } from "./src/components/theme";
import { loadWorkspace, loadRecord, saveNote, registerVoiceNote, saveTask } from "./src/services/storage";
import { loadDrafts, saveDraft, acceptStep } from "./src/services/drafts";
import { loadProfile, saveProfile } from "./src/services/profile";
import { syncProgress } from "./src/services/progress";
import { ensureSteps, processCapturedNote, replayOldRecordings } from "./src/services/processing";
import { buildStamp, mirrorToDev } from "./src/services/mirror";
import { capabilities, devLanConfig } from "./src/services/processors";
import { loadAiState, setCloudConsent } from "./src/services/ai-state";
import type { Consent } from "./src/ai-policy";
import { EVENING_ID, scheduledSummary, sendTestReminder, syncReminders } from "./src/services/reminders";
import { exportAllData, deleteAllData, importAllData } from "./src/services/data";
import Constants from "expo-constants";
import { newProfile, needsFunnel, type Profile as ProfileModel } from "./src/personality";
import { newProgress, levelForProgress } from "./src/progress";
import { completeTask, pickNextTask } from "./src/task-flow";
import * as Haptics from "expo-haptics";
import { modeFor, DEFAULT_MODE } from "./src/flow-voice";
import { answerChip, backfillConversation, respondToRecording, evaluateThread, noteLevelUp, moveHeadline, plannedDateFor, moveWhen, suggestPrompt } from "./src/thread";
import { appendPlanUpdate, suggestDraft, taskForStep, type ThoughtDraft } from "./src/drafts";
import type { Note, Task } from "./src/model";

type Screen = Tab | "thread" | "intake" | "recording" | "tomorrow";
type Capture = { mode: "voice" | "text"; threadId: string | null; kind: "thought" | "feedback" | "tomorrow"; prompt?: string };
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
  /** The week plan from the last dump, shown once. */
  const [plan, setPlan] = useState<Plan | null>(null);
  /** The phone's calendar, as last read. */
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [calendarOn, setCalendarOnState] = useState(false);
  const [calendars, setCalendars] = useState<PhoneCalendar[]>([]);
  const [remindersOn, setRemindersOn] = useState(false);
  /** The recording page that is open, and the model's paragraph for it. */
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [paragraph, setParagraph] = useState("");
  const [alsoTaskIds, setAlsoTaskIds] = useState<string[]>([]);
  /** The move sheet: the task being edited. */
  const [editing, setEditing] = useState<Task | null>(null);
  /** The evening ritual: what Flow proposes for tomorrow, and whether tomorrow is already set. */
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [tomorrowSet, setTomorrowSet] = useState<{ date: string; closure: string } | null>(null);
  const [suggestedLines, setSuggestedLines] = useState<string[]>([]);
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
  // Plan D: older iPhones ask once before any note text goes to the cloud shaper.
  const [consentAsk, setConsentAsk] = useState<((allowed: boolean) => void) | null>(null);
  const [cloudConsent, setCloudConsentState] = useState<Consent>(undefined);
  const [onDeviceAi, setOnDeviceAi] = useState(false);
  const lock = useRef(false);
  const processingLock = useRef(false);
  const captureId = useRef("");
  const revealAfterSheet = useRef<string | null>(null);
  const shapingAbort = useRef<AbortController | null>(null);
  const captureOpen = useRef(false);
  captureOpen.current = !!capture;
  const captureKindRef = useRef<Capture["kind"] | null>(null);
  captureKindRef.current = capture?.kind ?? captureKindRef.current;

  const mode = modeFor(profile.answers) ?? DEFAULT_MODE;
  // Same plain questions for everyone: no personality layer in the path.
  const formula = null;
  const current = threads.find((t) => t.id === openId);
  const openNote = notes.find((n) => n.id === openNoteId);
  const level = levelForProgress(progress);

  /** Thread reminders plus the morning "today's one move" nudge, from the freshly saved data. */
  function syncAll(data: { tasks: Task[]; threads: ThoughtDraft[] }, p: ProfileModel, ask = false) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const done = data.tasks.filter((t) => t.done && t.completedAt?.slice(0, 10) === today).length;
    // The morning line is tomorrow's day when it is sent after midnight, so it reads the next day.
    const headline = morningLine(events, data.tasks, tomorrowOf(now));
    return syncReminders(data.threads, data.tasks, now, {
      ask,
      enabled: !p.notificationsOff,
      morning: { headline, time: p.morningTime, off: p.morningOff },
      evening: { done, time: p.eveningTime, off: p.notificationsOff },
    }).catch(() => 0);
  }

  /** The evening ritual: load what Flow proposes and open the screen. */
  async function openTomorrow() {
    const [p, r] = await Promise.all([loadProposal(), loadRoutines()]);
    setProposal(p);
    setRoutines(r);
    setSuggestedLines([]);
    setScreen("tomorrow");
  }
  async function refreshTomorrow() {
    const date = tomorrowOf(new Date());
    const plan = await dayPlanFor(date).catch(() => null);
    setTomorrowSet(plan ? { date, closure: plan.closure } : null);
  }
  function lockDay(decision: Decision) {
    void run(async () => {
      const closure = await lockTomorrow(decision);
      const data = await refresh();
      await refreshCalendar();
      await refreshTomorrow();
      void syncAll(data, profile);
      setScreen("today");
      setLastTab("today");
      setNotice(closure);
    });
  }

  async function refresh() {
    const [w, d] = await Promise.all([loadWorkspace(), loadDrafts()]);
    setTasks(w.tasks);
    setNotes(w.notes);
    setThreads(d);
    // Dev only: the phone's data mirrors to the Mac mini so the real threads can be read and replayed there.
    void mirrorToDev("refresh");
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
      // A step marked accepted must have its task; repair any that a failed write left behind.
      for (const step of thread.steps) {
        const id = `flow:${thread.id}:${step.id}`;
        if (step.accepted && !thread.example && !data.tasks.some((t) => t.id === id)) {
          await saveTask(taskForStep(thread, step, plannedDateFor(profile.plate?.timeWindow)));
          changed = true;
        }
      }
      // Threads from older builds get their conversation first, then the usual check-ins.
      const next = evaluateThread(backfillConversation(thread, { mode, plate: profile.plate }), data.tasks, { mode });
      if (next !== thread) {
        await saveDraft(next);
        changed = true;
      }
    }
    if (changed) await refresh();
    void syncAll(data, profile);
  }

  useEffect(() => {
    // The evening close, tapped, opens the ritual.
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.identifier === EVENING_ID) void openTomorrow().catch(() => {});
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    void capabilities().then((c) => setOnDeviceAi(c.llm));
    void loadAiState()
      .then((a) => setCloudConsentState(a.consent))
      .catch(() => {});
  }, []);
  useEffect(() => {
    Promise.all([refresh(), loadProfile()])
      .then(async ([data, p]) => {
        setProfile(p);
        // New (and pre-build-12) profiles get welcome → first thought. Anyone who finished the test-first funnel keeps their flow.
        setFunnel(needsFunnel(p));
        setFunnelStep("intro");
        await evaluateAll(data);
        setReady(true);
        // A day nobody planned still gets its routine blocks.
        await startDay().then(async (n) => { if (n) await refresh(); }).catch(() => {});
        await refreshCalendar();
        await refreshTomorrow();
        // Earlier recordings that never went through the intake are planned now, from their transcripts.
        void replayOldRecordings().then(async (n) => {
          if (!n) return;
          setNotice(`Planned ${n === 1 ? "an earlier recording" : `${n} earlier recordings`} into your week.`);
          await evaluateAll(await refresh());
          await refreshCalendar();
        }).catch(() => {});
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Flow could not open its saved data.");
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void evaluateAll().catch(() => {});
        void startDay().then(async (n) => { if (n) await refresh(); }).catch(() => {});
        void refreshCalendar().catch(() => {});
        void refreshTomorrow().catch(() => {});
      }
    });
    const timer = setInterval(() => void evaluateAll().catch(() => {}), EVALUATE_EVERY_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [ready, mode]);

  /** Read the phone's calendar for the coming two weeks (no-op until connected), and what the person did there since. */
  async function refreshCalendar() {
    const on = await calendarConnected();
    setCalendarOnState(on);
    setRemindersOn(await remindersConnected().catch(() => false));
    if (on) {
      const back = await syncFromPhone().catch(() => ({ completed: 0, unplaced: 0 }));
      // Something new on the calendar sat on a Flow block: the block moves, and the person hears about it.
      const moved = await replanConflicts().catch(() => []);
      if (moved.length) setNotice(`Moved ${moved.map((t) => t.title).slice(0, 2).join(" and ")}${moved.length > 2 ? ` and ${moved.length - 2} more` : ""} — something landed on ${moved.length === 1 ? "it" : "them"}.`);
      if (back.completed || back.unplaced || moved.length) await refresh();
      setEvents(await readWeek().catch(() => []));
      setCalendars(await listCalendars().catch(() => []));
    }
  }
  async function connectCalendarNow(): Promise<boolean> {
    const ok = await connectCalendar();
    if (ok) await connectReminders().catch(() => false);
    await refreshCalendar();
    return ok;
  }
  async function connectRemindersNow() {
    await connectReminders().catch(() => false);
    await refreshCalendar();
  }

  /** Every change to a move goes through services/moves, then the screen re-reads. */
  function onTick(task: Task) {
    void run(async () => {
      if (task.done) await untickMove(task);
      else {
        await tickMove(task);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      // The evening close counts what was done; keep it current.
      void syncAll(await refresh(), profile);
    });
  }
  function onTomorrow(task: Task) {
    void run(async () => {
      await moveToTomorrow(task);
      await refresh();
      await refreshCalendar();
    });
  }
  function onEvening(task: Task) {
    void run(async () => {
      await moveToEvening(task);
      await refresh();
      await refreshCalendar();
    });
  }
  function onDeleteMove(task: Task) {
    void run(async () => {
      await deleteMove(task);
      setEditing(null);
      await refresh();
      await refreshCalendar();
    });
  }
  function onSaveMove(task: Task, patch: { title: string; plannedDate: string; plannedTime: string; deadline: string; minutes: number; projectId?: string }) {
    void run(async () => {
      await editMove(task, patch);
      setEditing(null);
      await refresh();
      await refreshCalendar();
    });
  }
  function openRecording(id: string) {
    setOpenNoteId(id);
    setParagraph("");
    setAlsoTaskIds([]);
    setScreen("recording");
    void loadRecord<{ summary?: string; knownTaskIds?: string[] }>("intake", `intake:${id}`)
      .then((r) => {
        setParagraph(r?.summary ?? "");
        setAlsoTaskIds(r?.knownTaskIds ?? []);
      })
      .catch(() => {});
  }
  function closeRecording() {
    setOpenNoteId(null);
    setScreen(lastTab);
  }

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
    // Nothing is asked on opening. A thin project gets its step tree from the brain, quietly.
    void ensureSteps(id, { askCloudConsent })
      .then(async (n) => {
        if (n) await refresh();
        await evaluateAll();
      })
      .catch(() => {});
  }
  function closeThread() {
    setScreen(openNoteId ? "recording" : lastTab);
    setOpenId(null);
  }
  function selectTab(tab: Tab) {
    // Leaving Your week by a tab is the same as "Looks right".
    if (screen === "intake") setPlan(null);
    setLastTab(tab);
    setScreen(tab);
    setNotice("");
    setError("");
  }

  function startCapture(
    mode: "voice" | "text",
    threadId: string | null,
    kind: "thought" | "feedback" | "tomorrow" = "thought",
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
  function askCloudConsent() {
    return new Promise<boolean>((resolve) =>
      setConsentAsk(() => (allowed: boolean) => {
        setConsentAsk(null);
        setCloudConsentState(allowed ? "allowed" : "declined");
        resolve(allowed);
      }),
    );
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
      captureKind: capture?.kind === "feedback" ? "feedback" : capture?.kind === "tomorrow" ? "note" : v.captureKind ?? "thought",
      id: v.audioUri,
      createdAt: new Date().toISOString(),
    });
  }
  function recordingCompleted(saved: SavedVoiceNote) {
    const entry: Note = {
      ...saved,
      planId: capture?.kind === "thought" ? capture.threadId ?? undefined : undefined,
      captureKind: capture?.kind === "feedback" ? "feedback" : capture?.kind === "tomorrow" ? "note" : "thought",
      id: saved.audioUri,
      createdAt: new Date().toISOString(),
    };
    setVoiceBusy(false);
    setVoiceResult(entry);
    void processRecording(entry);
  }
  /** Stop waiting for the AI: the thread is still made, from the basic template. */
  function cancelShaping() {
    shapingAbort.current?.abort();
  }
  /** Leave the capture sheet while Flow keeps thinking; the thread lands in the list. */
  function continueInBackground() {
    setCapture(null);
    selectTab(lastTab);
  }
  async function processRecording(entry: Note) {
    if (processingLock.current) return;
    processingLock.current = true;
    const abort = new AbortController();
    shapingAbort.current = abort;
    setProcessing(true);
    setProcessingError("");
    const before = level.level?.number ?? 0;
    try {
      const forTomorrow = captureKindRef.current === "tomorrow";
      const result = await processCapturedNote(entry, { askCloudConsent, signal: abort.signal });
      const data = await refresh();
      if (result.kind === "note" && forTomorrow) {
        // The smart connector: what was said about tomorrow, matched to the list. Not a recording, not a thread.
        const s = await suggestForTomorrow(result.note.text, new Date(), { askCloudConsent, signal: abort.signal });
        setProposal((p) => (p ? { ...p, suggested: [...(p.suggested ?? []), ...s.existing.filter((t) => !(p.suggested ?? []).some((x) => x.id === t.id))] } : p));
        setSuggestedLines((l) => [...l, ...s.lines.filter((x) => !l.includes(x))]);
        setCapture(null);
        setScreen("tomorrow");
        setNotice(s.existing.length || s.lines.length ? `Got it: ${s.existing.length} from your list, ${s.lines.length} new.` : "Nothing new in that — tomorrow stays as proposed.");
        return;
      }
      if (result.kind === "note") {
        setCapture(null);
        setNotice("Saved. Thank you — it stays on this phone.");
        return;
      }
      const stayedHere = captureOpen.current;
      setCapture(null);
      if (result.kind === "intake") {
        setEvents(result.plan.events);
        const first = result.plan.placements[0];
        if (result.plan.quick && !first) {
          setNotice(result.plan.known ? "Already on your week — nothing added." : "Nothing to add from that.");
          return;
        }
        if (result.plan.quick && first) {
          // One line, one move: say where it landed and stay put.
          const when = first.slot ? `${new Date(first.slot.start).toLocaleDateString("en-US", { weekday: "short" })} ${new Date(first.slot.start).toTimeString().slice(0, 5)}` : first.chaseDate ? `chase ${new Date(`${first.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}` : first.date ? new Date(`${first.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "later";
          setNotice(`Added: ${first.item.title} · ${when}${first.note ? ` — ${first.note}` : ""}`);
          await evaluateAll(data);
          await refreshTomorrow();
          return;
        }
        // The week, planned around the calendar. Shown once; nothing is asked.
        setPlan(result.plan);
        if (stayedHere) setScreen("intake");
        else setNotice(`Flow placed ${result.plan.placements.length} things on your week.`);
        await evaluateAll(data);
        return;
      }
      // Someone who walked away is not pulled into the thread; it is simply in their list.
      if (!stayedHere) setNotice(`Flow shaped “${result.draft.title}”. It's in your threads.`);
      else if (openId !== result.draft.id) reveal(result.draft.id);
      await evaluateAll(data);
      await announceLevel(result.draft.id, before);
    } catch (failure) {
      setProcessingError(failure instanceof Error ? failure.message : "Processing paused. Your recording is saved.");
      await refresh().catch(() => {});
    } finally {
      shapingAbort.current = null;
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
        captureKind: capture.kind === "tomorrow" ? "note" : capture.kind,
        title: text.slice(0, 80),
        text,
        createdAt: new Date().toISOString(),
      };
      await saveNote(n);
      setInput("");
      // Not awaited: the sheet can be left while Flow thinks, and Today stays usable.
      void processRecording(n);
    });
  }

  /** A typed message in a thread: saved as a note on that thread and answered in place. */
  function sendMessage(threadId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    void run(async () => {
      const n: Note = {
        id: randomUUID(),
        planId: threadId,
        captureKind: "thought",
        title: trimmed.slice(0, 80),
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      await saveNote(n);
      await processRecording(n);
    });
  }

  function chip(messageId: string, chipId: string) {
    if (!current) return;
    void run(async () => {
      const before = level.level?.number ?? 0;
      const { thread, effects } = answerChip(current, messageId, chipId, { mode, formula, plate: profile.plate, others: threads.map((t) => ({ id: t.id, title: t.title })) });
      await saveDraft(thread);
      for (const effect of effects) {
        if (effect.type === "accept") {
          const step = thread.steps.find((s) => s.id === effect.stepId);
          if (step) {
            await acceptStep(thread, step);
            // The move is an if-then plan: it lands on the day the person said they have time.
            const id = `flow:${thread.id}:${step.id}`;
            const saved = (await loadWorkspace()).tasks.find((t) => t.id === id);
            // The time the person gave ("Tomorrow morning") wins; otherwise their usual window, no time yet.
            const when = moveWhen(thread);
            if (saved)
              await saveTask(
                when
                  ? { ...saved, plannedDate: when.date, plannedTime: when.time }
                  : { ...saved, plannedDate: plannedDateFor(profile.plate?.timeWindow) },
              );
            await updateProfile({ ...profile, activeTaskId: id });
          }
        } else if (effect.type === "complete") {
          const task = tasks.find((t) => t.id === effect.taskId);
          if (task && !task.done) await saveTask(completeTask(task));
        } else if (effect.type === "branch") {
          // Each other subject becomes its own thread, opened with the person's own words for it.
          for (const branch of effect.branches) {
            const id = randomUUID();
            const seeded = { ...suggestDraft(id, branch.evidence), title: branch.title };
            await saveDraft(respondToRecording(seeded, id, branch.evidence, { mode, formula, plate: profile.plate }));
          }
        } else if (effect.type === "tie") {
          // The side subject's words go to the thread the person picked, quietly; it is there when they open it.
          const home = (await loadDrafts()).find((t) => t.id === effect.threadId);
          if (home) {
            const words = effect.branches.map((b) => b.evidence).join(" ");
            const id = `${messageId}:tie`;
            await saveDraft(respondToRecording(appendPlanUpdate(home, suggestDraft(id, words)), id, words, { mode, formula, plate: profile.plate, quiet: true }));
          }
        }
      }
      const data = await refresh();
      // Confirming a move is the moment a reminder makes sense, so this is when permission is requested.
      if (effects.some((e) => e.type === "accept") && !profile.notificationsOff)
        void syncAll(data, profile, true);
      await announceLevel(thread.id, before);
    });
  }

  const captureTitle =
    capture?.kind === "tomorrow"
      ? "Tomorrow"
      : capture?.kind === "feedback"
      ? "Tell Flow something"
      : capture?.threadId
        ? current?.title ?? "Add to this thread"
        : capture?.mode === "text"
          ? "Write it down"
          : "Record";
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
          {/* A page sheet sits below the screen top, so padding-style avoidance misjudges the keyboard; iOS insets the scroll view itself. */}
          <View style={{ flex: 1 }}>
            <View style={s.sheetHead}>
              <Text style={s.kicker} numberOfLines={1}>
                {capture?.kind === "feedback" ? "FEEDBACK" : capture?.kind === "tomorrow" ? "PLAN TOMORROW" : capture?.threadId ? "THIS THREAD" : ""}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeCapture} disabled={voiceBusy || busy || processing} hitSlop={12}>
                <Text style={s.link}>Close</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={s.sheetBody}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentInsetAdjustmentBehavior="automatic"
            >
              <Text style={s.sheetTitle}>{captureTitle}</Text>
              <Text style={s.body}>{captureHint}</Text>
              {consentAsk && (
                <View style={s.card}>
                  <View style={{ gap: 10 }}>
                    <Text style={s.body}>
                      Your iPhone can't run Apple's on-device AI. Flowthread can send the text of your note (never the audio) to a secure server to shape it. Nothing is stored.
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Allow" onPress={() => consentAsk(true)} style={s.primary}>
                      <Text style={s.primaryText}>Allow</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Keep it basic" onPress={() => consentAsk(false)} hitSlop={8} style={{ alignSelf: "center" }}>
                      <Text style={s.link}>Keep it basic</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {capture?.mode === "voice" ? (
                <>
                  {voiceResult ? (
                    <View style={s.card}>
                      <Text style={s.cardTitle}>{processing ? "Saved." : "Recording saved."}</Text>
                      {processing ? (!consentAsk && <Thinking onBackground={continueInBackground} onCancel={cancelShaping} />) : <AudioPlayback uri={voiceResult.audioUri!} />}
                      {!processing && <Text style={s.body}>{processingError}</Text>}
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
                  {/* While Flow waits for the cloud answer, nothing is thinking yet. */}
                  {processing && !consentAsk && <Thinking onBackground={continueInBackground} onCancel={cancelShaping} />}
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
          </View>
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
        <StatusBar style="auto" />
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
          onConnectCalendar={connectCalendarNow}
          calendarConnected={calendarOn}
          events={events}
          onExit={needsFunnel(profile) ? undefined : () => void run(async () => { await updateProfile({ ...profile, assessmentLaterAt: new Date().toISOString() }); setFunnel(false); selectTab("today"); })}
        />
        {captureSheet}
      </SafeAreaView>
    );
  }

  const suggestion = suggestPrompt(profile.plate, threads);
  const devSeed = typeof __DEV__ !== "undefined" && __DEV__ ? () => void seedDemoCalendar().then(() => refreshCalendar()) : undefined;
  const record = () => startCapture("voice", null, "thought", suggestion.prompt);
  const write = () => startCapture("text", null, "thought", suggestion.prompt);
  const realThreads = threads.filter((t) => !t.example);
  const projectsCount = realThreads.filter((t) => t.state !== "parked").length;
  const recordingsCount = notes.filter((n) => !n.planId && (!n.captureKind || n.captureKind === "thought") && n.text?.trim()).length;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {screen === "today" && (
          <Today
            events={events}
            tasks={tasks}
            tomorrow={watchOuts(events, new Date(), 2).filter((w) => w.date !== new Date().toISOString().slice(0, 10))}
            projects={realThreads.map((t) => ({ id: t.id, title: t.title }))}
            notice={notice}
            error={error || processingError}
            busy={busy}
            onTick={onTick}
            onOpenMove={setEditing}
            onTomorrow={onTomorrow}
            onEvening={onEvening}
            onDelete={onDeleteMove}
            onRecord={record}
            onWrite={write}
            onDismissNotice={() => {
              setNotice("");
              setError("");
              setProcessingError("");
            }}
            calendar={{ connected: calendarOn, onConnect: () => void connectCalendarNow() }}
            tomorrowPlan={{
              locked: !!tomorrowSet,
              sub: tomorrowSet ? tomorrowSet.closure.replace(/^Tomorrow is set · /, "").replace(/\. Nothing to hold tonight\.$/, "") : "the calendar, your routines, what to carry — set it tonight",
              onOpen: () => void openTomorrow().catch(() => {}),
            }}
          />
        )}
        {screen === "tomorrow" && proposal && (
          <PlanTomorrow
            proposal={proposal}
            routines={routines}
            suggestedLines={suggestedLines}
            busy={busy}
            onLock={lockDay}
            onOpenMove={setEditing}
            onBack={() => setScreen("today")}
            onTalk={() => startCapture("voice", null, "tomorrow", "What does tomorrow hold? Say it all — Flow connects it to your list.")}
            onType={() => startCapture("text", null, "tomorrow", "What does tomorrow hold? Say it all — Flow connects it to your list.")}
          />
        )}
        {screen === "calendar" && (
          <CalendarTab events={events} tasks={tasks} connected={calendarOn} busy={busy} onConnect={() => void connectCalendarNow()} onOpenMove={setEditing} onRecord={record} onWrite={write} onSeed={devSeed} />
        )}
        {screen === "threads" && (
          <Threads notes={notes} threads={threads} tasks={tasks} busy={busy} onOpenRecording={(n) => openRecording(n.id)} onOpenThread={openThread} onRecord={record} onWrite={write} />
        )}
        {screen === "recording" && openNote && (
          <RecordingPage note={openNote} threads={threads} tasks={tasks} paragraph={paragraph} alsoTaskIds={alsoTaskIds} onBack={closeRecording} onTick={onTick} onOpenMove={setEditing} onAsk={openThread} />
        )}
        {screen === "recording" && !openNote && (
          <View style={s.loading}>
            <Text style={s.body}>That recording is no longer here.</Text>
            <Pressable accessibilityRole="button" onPress={closeRecording}>
              <Text style={s.link}>Back</Text>
            </Pressable>
          </View>
        )}
        {screen === "me" && (
          <Me
            recordings={recordingsCount}
            projects={projectsCount}
            calendars={calendars}
            calendarConnected={calendarOn}
            remindersConnected={remindersOn}
            notificationsOn={!profile.notificationsOff}
            morningTime={profile.morningTime ?? "08:30"}
            eveningTime={profile.eveningTime ?? "19:00"}
            version={Constants.expoConfig?.version ?? ""}
            build={buildStamp()}
            busy={busy}
            onConnectCalendar={() => void connectCalendarNow()}
            onCalendar={(id, on) =>
              void run(async () => {
                await setCalendarOn(id, on);
                await refreshCalendar();
              })
            }
            onConnectReminders={() => void connectRemindersNow()}
            onNotifications={(on) =>
              void run(async () => {
                const next = { ...profile, notificationsOff: on ? undefined : true };
                await updateProfile(next);
                if (on) await syncAll({ tasks, threads }, next, true);
                else await syncReminders([], [], new Date(), { enabled: false });
              })
            }
            onMorning={(time) =>
              void run(async () => {
                const next = { ...profile, morningTime: time };
                await updateProfile(next);
                await syncAll({ tasks, threads }, next, !next.morningOff);
              })
            }
            onEvening={(time) => void run(() => updateProfile({ ...profile, eveningTime: time }))}
            onFeedback={(m) => startCapture(m, null, "feedback")}
            onExport={() => void run(async () => void (await Share.share({ message: await exportAllData() })))}
            onDevReminder={typeof __DEV__ !== "undefined" && __DEV__ ? () => void sendTestReminder() : undefined}
            onDevScheduled={typeof __DEV__ !== "undefined" && __DEV__ ? () => void scheduledSummary().then((lines) => Alert.alert("Scheduled", lines.join("\n") || "Nothing scheduled.")) : undefined}
            onDevImport={
              typeof __DEV__ !== "undefined" && __DEV__ && devLanConfig()
                ? () =>
                    void run(async () => {
                      // The owner's phone, as mirrored on the dev server: the real scenario every test runs on.
                      const lan = devLanConfig()!;
                      const res = await fetch(`${lan.url}/mirror/${process.env.EXPO_PUBLIC_OWNER_INSTALL ?? "110da00b-1bb2-48da-9df9-4c747141d76e"}`, { headers: { Authorization: "Bearer " + lan.token } });
                      if (!res.ok) throw new Error("No mirror on the dev server.");
                      const got = await importAllData(await res.json());
                      await refresh();
                      await refreshCalendar();
                      setNotice(`Loaded ${got.records} records and ${got.threads} threads from the owner's phone.`);
                    })
                : undefined
            }
            cloud={onDeviceAi ? undefined : { on: cloudConsent === "allowed", onChange: (on) => void run(async () => { await setCloudConsent(on ? "allowed" : "declined"); setCloudConsentState(on ? "allowed" : "declined"); }) }}
            onDeleteAll={() =>
              Alert.alert("Delete all your data?", "Every thread, move, recording and setting on this phone will be erased. This cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete everything",
                  style: "destructive",
                  onPress: () =>
                    void run(async () => {
                      // Flow's blocks and chases leave the phone with the data.
                      await removeAllFlowItems().catch(() => ({ events: 0, reminders: 0 }));
                      await deleteAllData();
                      setPlan(null);
                      setTomorrowSet(null);
                      setEvents([]);
                      setProfile(newProfile());
                      setOpenId(null);
                      setFunnelStep("intro");
                      setFunnel(true);
                      await refresh();
                    }),
                },
              ])
            }
          />
        )}
        {screen === "intake" && plan && (
          <WeekPlan
            plan={plan}
            busy={busy}
            onOpenProject={openThread}
            onRecord={() => startCapture("voice", null, "thought", "Anything else on your mind?")}
            onWrite={() => startCapture("text", null, "thought", "Anything else on your mind?")}
            onDone={() => {
              setPlan(null);
              selectTab("today");
            }}
          />
        )}
        {screen === "thread" && current && (
          <ThreadChat
            thread={current}
            tasks={tasks}
            notes={notes}
            mode={mode}
            formula={formula}
            events={events}
            busy={busy}
            processing={processing && !capture}
            error={error || processingError}
            onRecord={() => startCapture("voice", current.id, "thought", pendingQuestion(current))}
            onSend={(text) => sendMessage(current.id, text)}
            onChip={chip}
            onClose={closeThread}
            others={realThreads.filter((t) => t.id !== current.id && t.state !== "parked" && !t.resolvedAt).map((t) => ({ id: t.id, title: t.title }))}
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
      {screen !== "thread" && screen !== "tomorrow" && <TabBar active={screen === "recording" ? "threads" : screen === "intake" ? "today" : screen} onSelect={selectTab} />}
      <MoveSheet task={editing} projects={realThreads.filter((t) => t.state !== "parked")} onSave={(patch) => editing && onSaveMove(editing, patch)} onDelete={() => editing && onDeleteMove(editing)} onClose={() => setEditing(null)} onOpenSource={editing?.noteId ? () => { const id = editing.noteId!; setEditing(null); openRecording(id); } : undefined} />
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
  sheetTitle: { fontSize: 30, lineHeight: 34, fontWeight: "800", color: C.ink, letterSpacing: -0.6 },
  kicker: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700", color: C.ink3 },
  body: { fontSize: 15, lineHeight: 22, color: C.muted },
  link: { color: C.blue, fontSize: 15, fontWeight: "700", paddingVertical: 6 },
  card: { padding: 16, borderRadius: 16, backgroundColor: C.tint, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: C.ink },
  input: { minHeight: 160, maxHeight: 300, padding: 16, borderRadius: 14, backgroundColor: C.tint, fontSize: 17, lineHeight: 24, color: C.ink, textAlignVertical: "top" },
  primary: { backgroundColor: C.accent, borderRadius: 26, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: C.white, fontSize: 16, fontWeight: "700" },
  error: { color: C.red, fontSize: 14, lineHeight: 20 },
});
