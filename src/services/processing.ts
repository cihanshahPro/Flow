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
import { respondToRecording, routeRecording } from "../thread";
import { profileContext } from "../ai-policy";
import { shapeText, transcribeAudio, type ShapeOptions } from "./processors";

export type CapturedNoteResult =
  { kind: "draft"; draft: ThoughtDraft } | { kind: "note"; note: Note };

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
  return { kind: "draft", draft: await processThoughtNote(stored, options) };
}

/** Compatibility entry point for callers that explicitly need a thought draft. */
export async function processVoiceNote(
  note: Note,
  options: ShapeOptions = {},
): Promise<ThoughtDraft> {
  return processThoughtNote(await savedNote(note), options);
}

async function processThoughtNote(
  note: Note,
  options: ShapeOptions,
): Promise<ThoughtDraft> {
  if (note.captureKind === "note" || note.captureKind === "feedback")
    throw new Error(
      "This capture is kept as a note, not a plan. Open it in Library.",
    );
  const existing = (await loadDrafts()).find(
    (d) => d.id === note.id || d.sourceNoteIds?.includes(note.id),
  );
  if (existing) return existing;
  const { note: transcribed, shape: audioShape } = await transcribeNote(note);
  const text = transcribed.text;
  const profile = await loadProfile().catch(() => null);
  let draft = suggestDraft(note.id, text);
  let shape = audioShape;
  let organizer: ThoughtDraft["organizer"] = "apple-local";
  if (!shape) {
    const outcome = await shapeText(text, profileContext(profile), options);
    shape = outcome.shape ?? undefined;
    organizer = outcome.kind === "cloud" ? "cloud" : "apple-local";
  }
  if (shape) {
    try {
      draft = shapedDraft(note.id, text, shape, organizer);
    } catch {
      console.warn("[Flow] organizer output could not be grounded");
    }
  }
  const flow = shapedVoice(shape, text);
  if (note.direction) draft = { ...draft, direction: note.direction };
  // A recording joins the thread it belongs to, then Flow replies. Nothing
  // becomes a goal until the person accepts a move Flow offers.
  const [workspace, threads] = await Promise.all([
    loadWorkspace().catch(() => ({ tasks: [], notes: [] })),
    loadDrafts(),
  ]);
  const mode = modeFor(profile?.answers) ?? DEFAULT_MODE;
  const targetId = note.planId ?? routeRecording(text, threads, workspace.tasks);
  const plan = targetId ? threads.find((d) => d.id === targetId) : undefined;
  if (plan) draft = appendPlanUpdate(plan, draft);
  draft = respondToRecording(draft, note.id, text, {
    mode,
    reply: flow.reply,
    question: flow.question,
    evidence: flow.evidence,
    plate: profile?.plate,
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
