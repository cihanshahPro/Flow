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
import { formulaFromAnswers, formulaPrompt } from "../formula";
import { extractDueHints, respondToRecording, routeRecording, threadContextFor } from "../thread";
import { segmentDump, subjectsOf } from "../intake";
import { profileContext } from "../ai-policy";
import { shapeText, transcribeAudio, type ShapeOptions } from "./processors";

export type CapturedNoteResult =
  | { kind: "draft"; draft: ThoughtDraft }
  /** A dump with several subjects: one thread starter per subject, quiet until opened. */
  | { kind: "intake"; drafts: ThoughtDraft[]; note: Note }
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
  return Array.isArray(result) ? { kind: "intake", drafts: result, note: stored } : { kind: "draft", draft: result };
}

/** Compatibility entry point for callers that explicitly need a thought draft. */
export async function processVoiceNote(
  note: Note,
  options: ShapeOptions = {},
): Promise<ThoughtDraft> {
  const result = await processThoughtNote(await savedNote(note), options, false);
  return Array.isArray(result) ? result[0] : result;
}

async function processThoughtNote(note: Note, options: ShapeOptions, allowIntake: false): Promise<ThoughtDraft>;
async function processThoughtNote(note: Note, options: ShapeOptions, allowIntake: boolean): Promise<ThoughtDraft | ThoughtDraft[]>;
async function processThoughtNote(
  note: Note,
  options: ShapeOptions,
  allowIntake: boolean,
): Promise<ThoughtDraft | ThoughtDraft[]> {
  if (note.captureKind === "note" || note.captureKind === "feedback")
    throw new Error(
      "This capture is kept as a note, not a plan. Open it in Library.",
    );
  const already = (await loadDrafts()).filter((d) => d.id === note.id || d.sourceNoteIds?.includes(note.id));
  if (already.length) return allowIntake && already.length > 1 ? already : already[0];
  const { note: transcribed, shape: audioShape } = await transcribeNote(note);
  const text = transcribed.text;
  const profile = await loadProfile().catch(() => null);
  // Find the thread this message continues before shaping, so the AI answers as a turn in that thread.
  const [workspace, threads] = await Promise.all([
    loadWorkspace().catch(() => ({ tasks: [], notes: [] })),
    loadDrafts(),
  ]);
  const mode = modeFor(profile?.answers) ?? DEFAULT_MODE;
  const formula = formulaFromAnswers(profile?.answers);
  const others = threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt).slice(0, 6).map((t) => t.title);
  // The intake: a dump about several things is never one thread's turn. Each subject is routed on its own —
  // into the thread it belongs to, or a quiet new starter — and Flow shows the list before it asks anything.
  if (!note.planId && allowIntake && segmentDump(text).length >= 2) {
    let listed = shapedVoice(audioShape, text).branches ?? [];
    if (!audioShape) {
      const fresh = { title: "", points: [], recent: [], otherThreads: others, script: formulaPrompt(formula), percent: 0, askNext: "And what else?" };
      const outcome = await shapeText(text, profileContext(profile), { ...options, thread: fresh }).catch(() => ({ shape: null }));
      listed = shapedVoice(outcome.shape ?? undefined, text).branches ?? [];
    }
    const subjects = subjectsOf(text, listed);
    if (subjects.length >= 2) {
      const drafts: ThoughtDraft[] = [];
      const joined = new Map<string, ThoughtDraft>();
      for (const [i, subject] of subjects.entries()) {
        const home = routeRecording(subject.evidence, threads, workspace.tasks, { strict: true });
        const target = home ? joined.get(home) ?? threads.find((t) => t.id === home) : undefined;
        if (target) {
          // Two subjects for the same thread are one update to it, with the person's sentences for both.
          const updated = respondToRecording(appendPlanUpdate(target, suggestDraft(`${note.id}:${i}`, subject.evidence)), `${note.id}:${i}`, subject.evidence, { mode, formula, plate: profile?.plate, now: options.now });
          const withSource = { ...updated, sourceNoteIds: [...new Set([...(updated.sourceNoteIds ?? []), note.id])] };
          joined.set(target.id, withSource);
          await saveDraft(withSource);
          const at = drafts.findIndex((d) => d.id === target.id);
          if (at >= 0) drafts[at] = withSource;
          else drafts.push(withSource);
          continue;
        }
        const started = respondToRecording(
              { ...suggestDraft(`${note.id}:${i}`, subject.evidence), title: subject.title, sourceNoteIds: [note.id], dueHints: extractDueHints(subject.evidence, options.now) },
              note.id,
              subject.evidence,
              { mode, formula, plate: profile?.plate, quiet: true, now: options.now },
            );
        await saveDraft(started);
        drafts.push(started);
      }
      return drafts;
    }
  }
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
 * Recordings made before the intake existed landed in one thread each (or
 * were swallowed by an old thread). Re-sort them once, from the saved
 * transcript, into thread starters — no re-recording. Runs on launch.
 */
export async function resortDumps(now = new Date()): Promise<{ recordings: number; threads: number }> {
  const [workspace, drafts, profile] = await Promise.all([
    loadWorkspace().catch(() => ({ tasks: [], notes: [] as Note[] })),
    loadDrafts(),
    loadProfile().catch(() => null),
  ]);
  const mode = modeFor(profile?.answers) ?? DEFAULT_MODE;
  const formula = formulaFromAnswers(profile?.answers);
  let recordings = 0, made = 0;
  let threads = drafts;
  for (const note of workspace.notes) {
    if (note.planId || (note.captureKind && note.captureKind !== "thought") || !note.text?.trim()) continue;
    const homes = threads.filter((d) => d.id === note.id || d.sourceNoteIds?.includes(note.id));
    if (homes.length !== 1 || homes[0].example) continue;
    const lump = homes[0];
    if (lump.resortedNoteIds?.includes(note.id)) continue;
    const subjects = subjectsOf(note.text);
    if (subjects.length < 2) continue;
    recordings++;
    const others = threads.filter((t) => t.id !== lump.id);
    for (const [i, subject] of subjects.entries()) {
      const home = routeRecording(subject.evidence, others, workspace.tasks, { strict: true });
      if (home) continue; // already has a thread of its own
      const id = `${note.id}:r${i}`;
      if (threads.some((t) => t.id === id)) continue;
      const started = respondToRecording(
        { ...suggestDraft(id, subject.evidence), title: subject.title, sourceNoteIds: [note.id], dueHints: extractDueHints(subject.evidence, now), createdAt: note.createdAt },
        note.id,
        subject.evidence,
        { mode, formula, plate: profile?.plate, quiet: true, now },
      );
      await saveDraft(started);
      threads = [...threads, started];
      made++;
    }
    // The lump stays only if the person talked in it; an untouched lump is parked out of the way.
    const talked = (lump.messages ?? []).filter((m) => m.from === "you").length > 1;
    const marked = { ...lump, resortedNoteIds: [...(lump.resortedNoteIds ?? []), note.id], ...(lump.id === note.id && !talked ? { state: "parked" as const } : {}) };
    await saveDraft(marked);
    threads = threads.map((t) => (t.id === lump.id ? marked : t));
  }
  return { recordings, threads: made };
}
