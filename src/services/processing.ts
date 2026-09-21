import { saveNote, loadWorkspace } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import {
  suggestDraft,
  shapedDraft,
  shapedVoice,
  appendPlanUpdate,
  type ThoughtDraft,
} from "../drafts";
import type { DirectionContext, Note } from "../model";
import { loadProfile } from "./profile";
import { modeFor, DEFAULT_MODE } from "../flow-voice";
import { formulaPrompt } from "../formula";
import { extractDueHints, respondToRecording, routeRecording, threadContextFor } from "../thread";
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
