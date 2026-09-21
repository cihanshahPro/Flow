import { C } from "./theme.ts";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import { copyRecording } from "../copy-recording.ts";
import { waitForRecordingForeground } from "../recording-lifecycle";

export type SavedVoiceNote = {
  // Recovery cannot infer the original destination from an orphan audio file.
  captureKind?: "note";
  title: string;
  text: string;
  audioUri: string;
  durationMs: number;
};
type Props = {
  onSaved: (note: SavedVoiceNote) => Promise<void>;
  compact?: boolean;
  autoStart?: boolean;
  onActivityChange?: (active: boolean) => void;
  onOpenSaved?: (note: SavedVoiceNote) => void;
  onComplete?: (note: SavedVoiceNote) => void;
};
type Phase =
  | "recovering"
  | "recovery-error"
  | "idle"
  | "preparing"
  | "recording"
  | "saving"
  | "retry";
type PendingRecording = {
  sourceUri: string;
  filename: string;
  note: SavedVoiceNote;
  copied: boolean;
};
const MAX_SECONDS = 10 * 60;
const JOURNAL_FILENAME = "anchor-pending-voice.json";
const JOURNAL_TEMP_FILENAME = "anchor-pending-voice.tmp.json";
const VOICE_FILENAME = /^anchor-voice-(?:retry-)?\d+-[a-z0-9]{1,20}\.m4a$/;
const clock = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";

// A single journal prevents new recordings from hiding an unfinished save.
function readPendingJournal(file: File): PendingRecording {
  if (file.size > 100_000)
    throw new Error("The recovery file is unexpectedly large.");
  const data: unknown = JSON.parse(file.textSync());
  if (!data || typeof data !== "object")
    throw new Error("The recovery file is invalid.");
  const entry = data as Record<string, unknown>;
  if (
    entry.version !== 1 ||
    typeof entry.filename !== "string" ||
    !VOICE_FILENAME.test(entry.filename) ||
    !entry.note ||
    typeof entry.note !== "object"
  )
    throw new Error("The recovery file has an unsupported format.");
  const note = entry.note as Record<string, unknown>;
  if (
    typeof note.title !== "string" ||
    note.title.length > 300 ||
    typeof note.text !== "string" ||
    note.text.length > 50_000 ||
    typeof note.audioUri !== "string" ||
    typeof note.durationMs !== "number" ||
    !Number.isFinite(note.durationMs) ||
    note.durationMs < 0 ||
    note.durationMs > MAX_SECONDS * 1000
  ) {
    throw new Error("The recovered note contains invalid details.");
  }
  const audio = new File(Paths.document, entry.filename);
  // Exact canonical URI and a generated basename exclude remote URLs and path traversal.
  if (!audio.uri.startsWith("file://") || note.audioUri !== audio.uri)
    throw new Error("The recovered audio is not a local document recording.");
  if (!audio.exists || audio.size === 0)
    throw new Error("The recovered recording file is missing or empty.");
  return {
    sourceUri: audio.uri,
    filename: entry.filename,
    copied: true,
    note: {
      title: note.title,
      text: note.text,
      audioUri: audio.uri,
      durationMs: note.durationMs,
    },
  };
}

function scanVoiceRecordings(): SavedVoiceNote[] {
  return Paths.document
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && VOICE_FILENAME.test(entry.name),
    )
    .filter(
      (file) =>
        file.exists &&
        file.size > 0 &&
        file.uri === new File(Paths.document, file.name).uri,
    )
    .map((file) => ({
      title: "Recovered voice note",
      text: "",
      audioUri: file.uri,
      durationMs: 0,
    }));
}

/** Foreground recording. The original audio is saved before note metadata is committed. */
export default function VoiceCapture({
  onSaved,
  compact = false,
  autoStart = false,
  onActivityChange,
  onOpenSaved,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("recovering");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsSettings, setNeedsSettings] = useState(false);
  const [saved, setSaved] = useState<SavedVoiceNote | null>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<Phase>("recovering");
  const preparationCancelled = useRef(false);
  const saveRef = useRef(onSaved);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const titleRef = useRef(title);
  const pending = useRef<PendingRecording | null>(null);
  const startedAt = useRef(0);
  const durationRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizing = useRef(false);
  const recovering = useRef(false);
  const finishRef = useRef<
    (alreadyStopped?: boolean, finishedUri?: string | null) => Promise<void>
  >(async () => {});
  saveRef.current = onSaved;
  titleRef.current = title;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
    if (status.hasError && mounted.current)
      setError(`Recording was interrupted. ${status.error ?? ""}`.trim());
    if (status.isFinished && phaseRef.current === "recording") {
      void finishRef.current(true, status.url);
    }
  });
  const recorderState = useAudioRecorderState(recorder, 250);
  if (recorderState.isRecording)
    durationRef.current = recorderState.durationMillis;

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    if (mounted.current) setPhase(next);
  }, []);

  const recoverPending = useCallback(async () => {
    if (recovering.current || finalizing.current) return;
    if (Platform.OS === "web") {
      updatePhase("idle");
      return;
    }
    recovering.current = true;
    updatePhase("recovering");
    let reconciled = 0;
    try {
      // Only our generated recording filenames are considered. Registering an
      // existing URI is a no-op in the parent, so this cannot replace edited notes.
      const candidates = new Map(
        scanVoiceRecordings().map((note) => [note.audioUri, note]),
      );
      const journals: {
        file: File;
        snapshot: string | null;
        size: number;
        modified: number | null;
        valid: boolean;
      }[] = [];
      for (const name of [JOURNAL_TEMP_FILENAME, JOURNAL_FILENAME]) {
        const file = new File(Paths.document, name);
        if (!file.exists) continue;
        const size = file.size;
        const modified = file.modificationTime;
        let snapshot: string | null = null;
        try {
          if (size > 100_000)
            throw new Error("The recovery file is unexpectedly large.");
          snapshot = file.textSync();
          const item = readPendingJournal(file);
          candidates.set(item.note.audioUri, item.note);
          journals.push({ file, snapshot, size, modified, valid: true });
        } catch {
          journals.push({ file, snapshot, size, modified, valid: false });
        }
      }
      const current = pending.current;
      if (current?.copied && candidates.has(current.note.audioUri))
        candidates.set(current.note.audioUri, current.note);
      if (mounted.current) {
        setError("");
        if (candidates.size || journals.length)
          setNotice(
            `Checking ${candidates.size} saved recording${candidates.size === 1 ? "" : "s"} for unfinished notes…`,
          );
      }
      for (const note of candidates.values()) {
        await saveRef.current({ ...note, captureKind: "note" });
        reconciled += 1;
      }
      // Keep unreadable metadata for inspection, but don't let it permanently
      // block recording after every discoverable audio file has been registered.
      for (const entry of journals) {
        if (
          !entry.file.exists ||
          entry.file.size !== entry.size ||
          entry.file.modificationTime !== entry.modified ||
          (entry.snapshot !== null && entry.file.textSync() !== entry.snapshot)
        )
          throw new Error(
            "A recovery file changed while checking recordings. Please retry.",
          );
        if (entry.valid) entry.file.delete();
        else
          entry.file.move(
            new File(
              Paths.document,
              `${entry.file.name}.broken-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ),
          );
      }
      pending.current = null;
      updatePhase("idle");
      if (mounted.current) {
        setTitle("");
        if (current?.copied) {
          setSaved(current.note);
          completeRef.current?.(current.note);
        }
        const damaged = journals.some((entry) => !entry.valid);
        if (damaged)
          setNotice(
            `${reconciled ? `Checked ${reconciled} saved recordings and restored any missing notes.` : "No saved recording files were found."} Some recovery metadata could not be read and was preserved separately. Check the voice inbox; recovered notes may have a generic title.`,
          );
        else if (reconciled)
          setNotice(
            `Checked ${reconciled} saved recording${reconciled === 1 ? "" : "s"}; any missing inbox entries were restored. Existing notes were kept.`,
          );
        else setNotice("");
      }
    } catch (failure) {
      updatePhase("recovery-error");
      if (mounted.current)
        setError(
          `Recovery could not finish after checking ${reconciled} recordings. Original audio was kept. Retry recovery when storage is available. ${message(failure)}`,
        );
    } finally {
      recovering.current = false;
    }
  }, [updatePhase]);

  const persistPending = useCallback(async () => {
    const item = pending.current;
    if (!item || finalizing.current) return;
    finalizing.current = true;
    updatePhase("saving");
    if (mounted.current) setError("");
    try {
      if (!item.copied) {
        const source = new File(item.sourceUri);
        if (!source.exists || source.size === 0)
          throw new Error("The recording file is empty or unavailable.");
        let destination = new File(Paths.document, item.filename);
        // Copy first: a failed copy or metadata save must never discard the source.
        if (destination.exists && destination.size !== source.size) {
          item.filename = `anchor-voice-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
          destination = new File(Paths.document, item.filename);
        }
        const name = item.filename;
        destination = await copyRecording<File>(source, () => new File(Paths.document, name));
        item.note.audioUri = destination.uri;
        item.copied = true;
      }
      await saveRef.current(item.note);
      pending.current = null;
      updatePhase("idle");
      if (mounted.current) {
        setTitle("");
        setSaved(item.note);
        setNotice("Recording saved on this device.");
        completeRef.current?.(item.note);
      }
    } catch (failure) {
      console.warn(
        "[Flow voice] save or registration failed",
        message(failure),
      );
      updatePhase(item.copied ? "recovery-error" : "retry");
      if (mounted.current)
        setError(
          `${item.copied ? "The audio copy remains on this device, but the note save needs recovery." : "Your recording is still available in temporary storage."} ${message(failure)}`,
        );
    } finally {
      finalizing.current = false;
    }
  }, [updatePhase]);

  const finish = useCallback(
    async (alreadyStopped = false, finishedUri?: string | null) => {
      if (phaseRef.current !== "recording") return;
      updatePhase("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const durationMs = Math.min(
        MAX_SECONDS * 1000,
        Math.max(durationRef.current, Date.now() - startedAt.current),
      );
      let stopError: unknown;
      let uri = finishedUri;
      try {
        uri ||= recorder.uri;
      } catch {
        /* The finished event may supply the URI instead. */
      }
      if (!alreadyStopped) {
        try {
          await recorder.stop();
        } catch (failure) {
          stopError = failure;
        }
      }
      try {
        uri ||= recorder.uri;
      } catch {
        /* A native interruption may already have released the recorder. */
      }
      // Return playback to the normal audio session after recording is finished.
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          shouldPlayInBackground: false,
          allowsBackgroundRecording: false,
        });
      } catch {
        /* Saving audio must not depend on audio routing. */
      }
      if (!uri) {
        updatePhase("idle");
        if (mounted.current)
          setError(
            `No recording file was produced. ${stopError ? message(stopError) : "Please record again."}`,
          );
        return;
      }
      pending.current = {
        sourceUri: uri,
        filename: `anchor-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`,
        copied: false,
        note: {
          title:
            titleRef.current.trim() ||
            `Voice note · ${new Date().toLocaleString()}`,
          text: "",
          audioUri: uri,
          durationMs,
        },
      };
      await persistPending();
    },
    [persistPending, recorder, updatePhase],
  );
  finishRef.current = finish;

  const cancelPreparation = async () => {
    try {
      await recorder.stop();
    } catch {
      /* Preparation may not have created an active recorder. */
    }
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
      });
    } catch {
      /* Best-effort native session cleanup. */
    }
  };

  const start = async () => {
    if (phaseRef.current !== "idle") return;
    if (Platform.OS === "web") {
      setError("Use the iPhone or Android app to record a voice note.");
      return;
    }
    preparationCancelled.current = false;
    updatePhase("preparing");
    setError("");
    setNotice("");
    setNeedsSettings(false);
    setSaved(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        await cancelPreparation();
        if (mounted.current) {
          setError(
            "Microphone access is needed to record. Your other notes are still available.",
          );
          setNeedsSettings(!permission.canAskAgain);
        }
        updatePhase("idle");
        return;
      }
      await waitForRecordingForeground(
        AppState,
        () => !mounted.current || preparationCancelled.current,
      );
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
      });
      await waitForRecordingForeground(
        AppState,
        () => !mounted.current || preparationCancelled.current,
      );
      await recorder.prepareToRecordAsync();
      await waitForRecordingForeground(
        AppState,
        () => !mounted.current || preparationCancelled.current,
      );
      durationRef.current = 0;
      startedAt.current = Date.now();
      recorder.record({ forDuration: MAX_SECONDS });
      updatePhase("recording");
      // Native duration limit plus a foreground timer gives both stop paths a save handler.
      timer.current = setTimeout(() => {
        void finishRef.current();
      }, MAX_SECONDS * 1000);
    } catch (failure) {
      await cancelPreparation();
      updatePhase("idle");
      if (mounted.current)
        setError(/prepare|AudioRecording|recorder|permission/i.test(message(failure)) ? "Couldn't reach the microphone. Allow it in Settings, or write it down instead." : `Could not start recording. ${message(failure)}`);
    }
  };

  useLayoutEffect(() => {
    mounted.current = true;
    void recoverPending();
    return () => {
      mounted.current = false;
      preparationCancelled.current = true;
      if (timer.current) clearTimeout(timer.current);
      // Run before useAudioRecorder's passive cleanup releases its native object.
      if (phaseRef.current === "recording") void finishRef.current();
      else if (phaseRef.current === "preparing") void cancelPreparation();
    };
  }, [recoverPending]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      // Permission dialogs can briefly be inactive; only an actual background transition cancels preparation.
      if (state === "background" && phaseRef.current === "preparing")
        preparationCancelled.current = true;
      if (state !== "active" && phaseRef.current === "recording") {
        if (mounted.current)
          setNotice("Recording stopped when you left the app.");
        void finishRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      recorderState.mediaServicesDidReset &&
      phaseRef.current === "recording"
    ) {
      setNotice(
        "The microphone was interrupted. Saving the audio captured so far.",
      );
      void finishRef.current(true, recorderState.url);
    }
  }, [recorderState.mediaServicesDidReset, recorderState.url]);

  const didAutoStart = useRef(false);
  useEffect(() => {
    onActivityChange?.(
      ["recording", "preparing", "saving", "recovering"].includes(phase),
    );
    if (autoStart && phase === "idle" && !didAutoStart.current) {
      didAutoStart.current = true;
      void start();
    }
  }, [phase, autoStart, onActivityChange]);
  const working =
    phase === "recovering" || phase === "preparing" || phase === "saving";
  return (
    <View
      style={[
        styles.card,
        compact && styles.compact,
      ]}
    >
      {!compact && (
        <>
          <Text style={styles.eyebrow}>VOICE INBOX</Text>
          <Text style={styles.heading}>Get it off your mind.</Text>
          <Text style={styles.body}>No title needed. Your recording saves when you stop.</Text>
        </>
      )}
      {compact && (
        <Text style={styles.bigTime} accessibilityLabel={`Recorded ${clock(phase === "recording" ? recorderState.durationMillis : durationRef.current)}`}>
          {clock(phase === "recording" ? recorderState.durationMillis : durationRef.current)}
        </Text>
      )}
      {!compact && (
        <TextInput
          value={title}
          onChangeText={setTitle}
          editable={phase === "idle"}
          placeholder="Give this thought a name (optional)"
          placeholderTextColor="#6D8781"
          accessibilityLabel="Voice note title"
          style={styles.input}
          maxLength={120}
        />
      )}
      <View style={styles.statusRow}>
        <View style={[styles.dot, phase === "recording" && styles.liveDot]} />
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {phase === "recording"
            ? "Recording"
            : phase === "saving"
              ? "Saving your audio…"
              : phase === "preparing"
                ? "Preparing microphone…"
                : phase === "recovering"
                  ? "Checking saved recordings…"
                  : phase === "recovery-error"
                    ? "Recovery needs attention"
                    : phase === "retry"
                      ? "Save needs attention"
                      : "Ready when you are"}
        </Text>
        {!compact && (
          <Text style={styles.time}>
            {clock(phase === "recording" ? recorderState.durationMillis : durationRef.current)} / 10:00
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: working }}
        disabled={working}
        onPress={
          phase === "recording"
            ? () => void finish()
            : phase === "retry"
              ? () => void persistPending()
              : phase === "recovery-error"
                ? () => void recoverPending()
                : () => void start()
        }
        style={({ pressed }) => [
          styles.button,
          compact && { backgroundColor: C.accent, borderRadius: 26, minHeight: 52 },
          phase === "recording" && styles.stopButton,
          (working || pressed) && styles.dim,
        ]}
      >
        <Text style={styles.buttonText}>
          {phase === "recording"
            ? "Stop & save"
            : phase === "retry"
              ? "Retry saving note"
              : phase === "recovery-error"
                ? "Retry recovery"
                : working
                  ? "One moment…"
                  : "Start recording"}
        </Text>
      </Pressable>
      {!compact && <Text style={styles.hint}>Up to 10 minutes. Keep this app open while recording.</Text>}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {needsSettings && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              setError("Open your device Settings to allow microphone access."),
            )
          }
        >
          <Text style={styles.link}>Open microphone settings</Text>
        </Pressable>
      )}
      {saved && phase === "idle" && (
        <View>
          <AudioPlayback uri={saved.audioUri} />
          {onOpenSaved && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenSaved(saved)}
            >
              <Text style={styles.link}>Open saved note in Library</Text>
            </Pressable>
          )}
        </View>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      )}
    </View>
  );
}

export { VoiceCapture };

export function AudioPlayback({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState("");
  const toggle = async () => {
    setError("");
    try {
      if (status.playing) player.pause();
      else {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        if (status.duration > 0 && status.currentTime >= status.duration - 0.1)
          await player.seekTo(0);
        player.play();
      }
    } catch (failure) {
      setError(`Could not play this recording. ${message(failure)}`);
    }
  };
  const pct = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <View style={styles.playback}>
      <View style={styles.playerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status.playing ? "Pause recording" : "Play recording"
          }
          onPress={() => void toggle()}
          style={({ pressed }) => [styles.playCircle, pressed && styles.dim]}
        >
          <Text style={styles.playGlyph}>{status.playing ? "❚❚" : "▶"}</Text>
        </Pressable>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.round(pct * 100)}%` }]} />
        </View>
        <Text style={styles.playerTime}>
          {clock(status.currentTime * 1000)} / {clock(status.duration * 1000)}
        </Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.tint,
    borderColor: C.hair,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  eyebrow: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  heading: { color: C.ink, fontSize: 23, fontWeight: "700" },
  body: { color: C.ink2, fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: C.hair,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: C.ink,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink3 },
  liveDot: { backgroundColor: C.record },
  status: { color: C.ink2, fontSize: 13 },
  time: {
    color: C.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  button: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    minHeight: 48,
  },
  stopButton: { backgroundColor: C.red },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  dim: { opacity: 0.6 },
  compact: { backgroundColor: C.paper, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, alignItems: "stretch", gap: 14 },
  bigTime: { fontSize: 44, fontWeight: "800", color: C.ink, textAlign: "center", fontVariant: ["tabular-nums"], letterSpacing: -1, paddingVertical: 8 },
  hint: { color: C.ink3, fontSize: 12, lineHeight: 18 },
  error: { color: C.red, fontSize: 13, lineHeight: 19 },
  notice: { color: C.green, fontSize: 13, lineHeight: 19 },
  link: { color: C.accent, fontWeight: "700", paddingVertical: 8 },
  playback: { gap: 6 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  playCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  playGlyph: { color: C.white, fontSize: 13, fontWeight: "800" },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.hair, overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  playerTime: { fontSize: 12, fontWeight: "600", color: C.ink2, fontVariant: ["tabular-nums"] },
  playButton: {
    backgroundColor: C.tint,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  playText: { color: C.accent, fontSize: 13, fontWeight: "700" },
});
