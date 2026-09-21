import { saveNote, loadWorkspace, listRecordIds } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import {
  suggestDraft,
  shapedDraft,
  shapedVoice,
  appendPlanUpdate,
  type ThoughtDraft,
} from "../drafts";
import type { DirectionContext, Note, Task } from "../model";
import { loadProfile } from "./profile";
import { modeFor, DEFAULT_MODE } from "../flow-voice";
import { formulaPrompt } from "../formula";
import { extractDueHints, readAcceptance, respondToRecording, routeRecording, threadContextFor, threadTasks } from "../thread";
import { chatContextText } from "../ai-policy";
import { chatText, planText } from "./processors";
import { readWeek } from "./calendar-read";
import { matchEvents } from "../map";
import { timeLabel, type CalEvent } from "../calendar";
import { subjectsOf } from "../intake";
import { runIntake, type WeekPlan } from "./intake";
import { profileContext } from "../ai-policy";
import { shapeText, transcribeAudio, type ShapeOptions } from "./processors";

export type CapturedNoteResult =
  | { kind: "draft"; draft: ThoughtDraft }
  /** A dump from Today: read into the week plan (projects, moves, chases, calendar). */
  | { kind: "intake"; plan: WeekPlan; note: Note }
  | { kind: "note"; note: Note };

async function savedNote(note: Note): Promise<Note> {
  return (await loadWorkspace()).notes.find((n) => n.id === note.id) ?? note;
}

/** All capture kinds share the same saved audio and transcription retry path. */
async function transcribeNote(
  note: Note,
): Promise<{ note: Note; shape?: unknown }> {
  let text = note.text;
  let shape: unknown;
  if (!text.trim()) {
    if (!note.audioUri)
      throw new Error("This note has no recording to process.");
    const result = await transcribeAudio(note.audioUri);
    if (!result.text.trim() || result.text.length > 20000)
      throw new Error("No usable transcript came back. Your audio is still saved.");
    text = result.text.trim();
    shape = result.shape;
  }
  // Commit the transcript before any planning. A later retry reuses saved text.
  const transcribed = { ...note, text };
  await saveNote(transcribed);
  return { note: transcribed, shape };
}

/** Saved kind wins over a stale caller: notes and feedback never become plans. */
export async function processCapturedNote(
  note: Note,
  options: ShapeOptions = {},
): Promise<CapturedNoteResult> {
  const stored = await savedNote(note);
  if (stored.captureKind === "note" || stored.captureKind === "feedback") {
    const result = await transcribeNote(stored);
    return { kind: "note", note: result.note };
  }
  const result = await processThoughtNote(stored, options, true);
  return isPlan(result) ? { kind: "intake", plan: result, note: stored } : { kind: "draft", draft: result };
}

/** Compatibility entry point for callers that explicitly need a thought draft. */
export async function processVoiceNote(
  note: Note,
  options: ShapeOptions = {},
): Promise<ThoughtDraft> {
  const result = await processThoughtNote(await savedNote(note), options, false);
  if (isPlan(result)) throw new Error("unexpected plan");
  return result;
}

function isPlan(x: ThoughtDraft | WeekPlan): x is WeekPlan {
  return "placements" in x;
}

async function processThoughtNote(
  note: Note,
  options: ShapeOptions,
  allowIntake: boolean,
): Promise<ThoughtDraft | WeekPlan> {
  if (note.captureKind === "note" || note.captureKind === "feedback")
    throw new Error(
      "This capture is kept as a note, not a plan. Open it in Library.",
    );
  const already = (await loadDrafts()).filter((d) => d.id === note.id || d.sourceNoteIds?.includes(note.id));
  if (already.length) return already[0];
  const { note: transcribed, shape: audioShape } = await transcribeNote(note);
  const text = transcribed.text;
  const profile = await loadProfile().catch(() => null);
  // Find the thread this message continues before shaping, so the AI answers as a turn in that thread.
  const [workspace, threads] = await Promise.all([
    loadWorkspace().catch(() => ({ tasks: [], notes: [] })),
    loadDrafts(),
  ]);
  const mode = modeFor(profile?.answers) ?? DEFAULT_MODE;
  const formula = null; // same plain questions for everyone
  const others = threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt).slice(0, 6).map((t) => t.title);
  // The intake: anything said from Today (not inside a thread) is read into the week plan.
  if (!note.planId && allowIntake) return runIntake(transcribed, text, options);
  const targetId = note.planId ?? routeRecording(text, threads, workspace.tasks);
  const plan = targetId ? threads.find((d) => d.id === targetId) : undefined;
  // Inside a thread, Flow is the person's assistant: it answers from the project, asks one thing, or puts one move on the table.
  if (plan && note.planId && !audioShape) {
    const openOffer = [...(plan.messages ?? [])].reverse().find((m) => m.from === "flow" && m.kind === "offer" && !m.answered);
    if (!(openOffer && readAcceptance(text))) {
      const context = chatContextText(chatBrief(plan, threads, workspace.tasks, await readWeek().catch(() => [])));
      const turn = await chatText(text, context, options);
      // With a brain: its reply, its one question or one move. Without one: a plain acknowledgement — never the script's "And what else?".
      const answered = respondToRecording(appendPlanUpdate(plan, suggestDraft(note.id, text)), note.id, text, {
        mode,
        formula,
        ...(turn.chat ? { reply: turn.chat.reply } : {}),
        plate: profile?.plate,
        assistant: turn.chat ? { question: turn.chat.question, move: turn.chat.move } : {},
      });
      await saveDraft(answered);
      return answered;
    }
  }
  let draft = suggestDraft(note.id, text);
  let shape = audioShape;
  let organizer: ThoughtDraft["organizer"] = "apple-local";
  if (!shape) {
    // A first dump is still a turn in the script: the model reflects, the app asks "And what else?".
    const fresh = { title: "", points: [], recent: [], otherThreads: others, script: formulaPrompt(formula), percent: 0, askNext: "And what else?" };
    const outcome = await shapeText(text, profileContext(profile), {
      ...options,
      thread: plan ? threadContextFor(plan, threads, formula) : fresh,
    });
    shape = outcome.shape ?? undefined;
    organizer = outcome.kind === "cloud" ? "cloud" : "apple-local";
  }
  if (shape) {
    try {
      draft = shapedDraft(note.id, text, shape, organizer);
    } catch {
      console.warn("[Flow] organizer output could not be grounded");
      // The title is still useful on its own; the moves fall back to the person's words.
      const title = (shape as { title?: unknown }).title;
      if (typeof title === "string" && title.trim() && title.trim().length <= 120) draft = { ...draft, title: title.trim() };
    }
  }
  const flow = shapedVoice(shape, text);
  if (note.direction) draft = { ...draft, direction: note.direction };
  // A recording joins the thread it belongs to, then Flow replies. Nothing
  // becomes a goal until the person accepts a move Flow offers.
  if (plan) draft = appendPlanUpdate(plan, draft);
  draft = respondToRecording(draft, note.id, text, {
    mode,
    formula,
    reply: flow.reply,
    question: flow.question,
    evidence: flow.evidence,
    plate: profile?.plate,
    branches: flow.branches,
    others: threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt).map((t) => ({ id: t.id, title: t.title, words: [t.source, ...t.updates].join(" "), people: t.people })),
  });
  await saveDraft(draft);
  return draft;
}

/** Typed thought: shaped by the selected processor; throws when only the template is available. */
async function fetchShape(text: string) {
  const profile = await loadProfile().catch(() => null);
  const outcome = await shapeText(text, profileContext(profile));
  if (!outcome.shape)
    throw new Error("Flow could only make a basic draft this time. Your thought is saved.");
  return outcome;
}

export async function organizeThought(
  id: string,
  text: string,
  direction?: DirectionContext,
) {
  const outcome = await fetchShape(text);
  const draft = shapedDraft(
    id,
    text,
    outcome.shape,
    outcome.kind === "cloud" ? "cloud" : "apple-local",
  );
  return direction ? { ...draft, direction } : draft;
}
export async function createThoughtDraft(
  id: string,
  text: string,
  direction?: DirectionContext,
) {
  try {
    return await organizeThought(id, text, direction);
  } catch {
    const draft = suggestDraft(id, text);
    return direction ? { ...draft, direction } : draft;
  }
}

/**
 * Recordings made before the intake existed (or before it planned the week)
 * are run through it once, from their saved transcripts: projects, moves,
 * chases, calendar — nothing to re-record. Newest first, a few at a time,
 * in the background after launch.
 */
export async function replayOldRecordings(limit = 6, options: ShapeOptions = {}): Promise<number> {
  const [workspace, records] = await Promise.all([loadWorkspace().catch(() => ({ tasks: [], notes: [] as Note[] })), listRecordIds("intake")]);
  const done = new Set(records);
  const pending = workspace.notes
    .filter((n) => !n.planId && (!n.captureKind || n.captureKind === "thought") && n.text?.trim() && !done.has(`intake:${n.id}`))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  let n = 0;
  for (const note of pending) {
    try {
      await runIntake(note, note.text, options);
      n++;
    } catch {
      /* the next launch tries again */
    }
  }
  return n;
}

/** The project as the assistant sees it. */
export function chatBrief(thread: ThoughtDraft, threads: ThoughtDraft[], tasks: Task[], events: CalEvent[]) {
  const mine = threadTasks(thread, tasks);
  const day = (d: string) => {
    const x = new Date(`${d}T12:00:00`);
    return `${x.toLocaleDateString("en-US", { weekday: "short" })} ${x.toLocaleDateString("en-US", { month: "short" })} ${x.getDate()}`;
  };
  const linked = matchEvents(events.filter((e) => !e.mine), [{ id: thread.id, title: thread.title, area: thread.area, people: thread.people, words: [thread.source, ...thread.updates].join(" ") }]).get(thread.id) ?? [];
  const recent = (thread.messages ?? []).filter((m) => ["transcript", "ack", "question", "reply", "offer"].includes(m.kind)).slice(-10).map((m) => ({ from: m.from, text: m.text }));
  const openOffer = [...(thread.messages ?? [])].reverse().find((m) => m.from === "flow" && m.kind === "offer" && !m.answered);
  return {
    title: thread.title,
    area: thread.area,
    said: [thread.source, ...thread.updates].join(" "),
    moves: mine.filter((t) => t.kind !== "waiting").map((t) => ({ title: t.title, when: t.plannedDate ? `${day(t.plannedDate)}${t.plannedTime ? " " + t.plannedTime : ""}` : "", done: t.done })),
    waiting: mine.filter((t) => t.kind === "waiting" && !t.done).map((t) => ({ title: t.title, who: t.waitingOn, chase: t.chaseDate ? day(t.chaseDate) : "" })),
    events: linked.slice(0, 6).map((e) => `${e.title} · ${new Date(e.start).toLocaleDateString("en-US", { weekday: "short" })} ${new Date(e.start).toLocaleDateString("en-US", { month: "short" })} ${new Date(e.start).getDate()}${e.allDay ? "" : " " + timeLabel(e.start)}`),
    others: threads.filter((t) => t.id !== thread.id && !t.example && t.state !== "parked" && !t.resolvedAt).slice(0, 6).map((t) => t.title),
    recent,
    ...(openOffer ? { openMove: openOffer.text } : {}),
  };
}

/**
 * The step tree for a project: when a thread has fewer than two open moves,
 * the brain breaks it into 3–6 ordered concrete steps (the plan contract,
 * every item an action on this project). Steps become the thread's offerable
 * moves; nothing goes on the calendar until the person says "do it".
 */
export async function ensureSteps(threadId: string, options: ShapeOptions = {}): Promise<number> {
  const [threads, workspace] = await Promise.all([loadDrafts(), loadWorkspace()]);
  const thread = threads.find((t) => t.id === threadId);
  if (!thread || thread.example || thread.resolvedAt) return 0;
  const open = threadTasks(thread, workspace.tasks).filter((t) => !t.done && t.kind !== "waiting");
  const pending = thread.steps.filter((st) => !st.accepted && !(thread.declinedStepIds ?? []).includes(st.id));
  if (open.length + pending.length >= 2 || thread.stepsPlannedAt) return 0;
  const said = [thread.source, ...thread.updates].join(" ").slice(0, 4000);
  const context = `PROJECT: ${thread.title}${thread.area ? ` (${thread.area})` : ""}. Break this one project into 3 to 6 ordered concrete steps the person will do, first step first; every item is kind action with project "${thread.title}"; skip anything already done: ${open.map((t) => t.title).join("; ") || "nothing yet"}.`;
  const outcome = await planText(said, context, options);
  const items = (outcome.plan?.items ?? []).filter((i) => i.kind === "action").slice(0, 6);
  const existing = new Set([...thread.steps.map((st) => st.title.toLowerCase()), ...open.map((t) => t.title.toLowerCase())]);
  const fresh = items.filter((i) => !existing.has(i.title.toLowerCase()));
  const steps = fresh.map((i, k) => ({ id: `plan:${threadId}:${k}:${Date.now().toString(36)}`, title: i.title, minutes: i.minutes ?? 20, evidence: i.evidence }));
  await saveDraft({ ...thread, steps: [...thread.steps, ...steps], stepsPlannedAt: new Date().toISOString() });
  return steps.length;
}
