import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { saveNote, loadWorkspace } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import {
  suggestDraft,
  shapedDraft,
  appendPlanUpdate,
  missingThreadPoints,
  type ThoughtDraft,
} from "../drafts";
import type { DirectionContext, Note } from "../model";

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
    const url = process.env.EXPO_PUBLIC_PROCESSOR_URL;
    const token = process.env.EXPO_PUBLIC_PROCESSOR_TOKEN;
    if (!url || !token)
      throw new Error(
        "The local transcription service is not configured for this build.",
      );
    const file = new File(note.audioUri);
    if (!file.exists || !file.size)
      throw new Error("The saved recording could not be read.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 420000);
    try {
      const response = await fetch(url + "/process", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/octet-stream",
        },
        body: file,
        signal: controller.signal,
      });
      const result = (await response.json()) as {
        text?: string;
        shape?: unknown;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Transcription could not finish.");
      if (
        typeof result.text !== "string" ||
        !result.text.trim() ||
        result.text.length > 20000
      )
        throw new Error(
          "No usable transcript came back. Your audio is still saved.",
        );
      text = result.text.trim();
      shape = result.shape;
    } catch (error) {
      console.warn("[Flow voice] processing failed");
      if (error instanceof Error && !/network|fetch|abort/i.test(error.message))
        throw error;
      throw new Error(
        "Could not reach the Mac mini. Keep your phone on the same Wi-Fi, then retry processing.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  // Commit the transcript before any planning. A later retry reuses saved text.
  const transcribed = { ...note, text };
  await saveNote(transcribed);
  return { note: transcribed, shape };
}

/** Saved kind wins over a stale caller: notes and feedback never become plans. */
export async function processCapturedNote(
  note: Note,
): Promise<CapturedNoteResult> {
  const stored = await savedNote(note);
  if (stored.captureKind === "note" || stored.captureKind === "feedback") {
    const result = await transcribeNote(stored);
    return { kind: "note", note: result.note };
  }
  return { kind: "draft", draft: await processThoughtNote(stored) };
}

/** Compatibility entry point for callers that explicitly need a thought draft. */
export async function processVoiceNote(note: Note): Promise<ThoughtDraft> {
  return processThoughtNote(await savedNote(note));
}

async function processThoughtNote(note: Note): Promise<ThoughtDraft> {
  if (note.captureKind === "note" || note.captureKind === "feedback")
    throw new Error(
      "This capture is kept as a note, not a plan. Open it in Library.",
    );
  const existing = (await loadDrafts()).find(
    (d) => d.id === note.id || d.sourceNoteIds?.includes(note.id),
  );
  if (existing) return existing;
  const { note: transcribed, shape } = await transcribeNote(note);
  const text = transcribed.text;
  let draft = suggestDraft(note.id, text);
  if (shape) {
    try {
      draft = shapedDraft(note.id, text, shape);
    } catch {
      console.warn("[Flow] organizer output could not be grounded");
    }
  } else if (note.text) {
    try {
      draft = await organizeThought(note.id, text, note.direction);
    } catch {
      /* Transcript remains usable in a basic draft. */
    }
  }
  if (note.direction) draft = { ...draft, direction: note.direction };
  // A recording is a saved thread first. It does not become an active goal
  // until the user returns and explicitly develops it.
  draft = {
    ...draft,
    threadStatus: draft.threadStatus ?? "dumped",
    goalsReady: draft.goalsReady ?? false,
    missingPoints: draft.missingPoints ?? missingThreadPoints(draft.source),
  };
  if (note.planId) {
    const plan = (await loadDrafts()).find((d) => d.id === note.planId);
    if (plan) draft = appendPlanUpdate(plan, draft);
  }
  await saveDraft(draft);
  return draft;
}

export async function organizeThought(
  id: string,
  text: string,
  direction?: DirectionContext,
) {
  const url = process.env.EXPO_PUBLIC_PROCESSOR_URL,
    token = process.env.EXPO_PUBLIC_PROCESSOR_TOKEN;
  if (!url || !token)
    throw new Error(
      "The Mac mini organizer is not connected. Your original thought is saved.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(url + "/process", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const result = (await response.json()) as {
      shape?: unknown;
      error?: string;
    };
    if (!response.ok)
      throw new Error(
        result.error || "The organizer is busy. Try again shortly.",
      );
    if (!result.shape)
      throw new Error(
        "Local AI is unavailable right now. Your thought is saved; try again shortly.",
      );
    const draft = shapedDraft(id, text, result.shape);
    return direction ? { ...draft, direction } : draft;
  } finally {
    clearTimeout(timer);
  }
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
