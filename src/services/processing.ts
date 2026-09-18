import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { saveNote, loadWorkspace } from "./storage";
import { loadDrafts, saveDraft } from "./drafts";
import { suggestDraft } from "../drafts";
import type { Note } from "../model";

export async function processVoiceNote(note: Note) {
  const existing = (await loadDrafts()).find((d) => d.id === note.id);
  if (existing) return existing;
  note = (await loadWorkspace()).notes.find((n) => n.id === note.id) ?? note;
  let text = note.text;
  if (!text) {
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
    const timeout = setTimeout(() => controller.abort(), 240000);
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
  // Store transcription before shaping. If the draft write fails, retry reuses text.
  await saveNote({ ...note, text });
  const draft = suggestDraft(note.id, text);
  await saveDraft(draft);
  return draft;
}
