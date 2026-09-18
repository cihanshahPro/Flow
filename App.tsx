import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { randomUUID } from "expo-crypto";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import VoiceCapture, {
  AudioPlayback,
  type SavedVoiceNote,
} from "./src/components/VoiceCapture";
import {
  TOPICS,
  localDate,
  todayTasks,
  type Task,
  type Note,
} from "./src/model";
import {
  loadWorkspace,
  saveTask,
  saveNote,
  registerVoiceNote,
  removeTask,
} from "./src/services/storage";
import { addTaskToCalendar, chooseAppleCalendar, resetCalendarLink, type ChooseCalendar } from "./src/services/calendar";
import { REMINDERS, deviceTimeZone, reminderLabel, extractContactDetails } from "./src/calendar-model";
import { capabilities } from "./src/services/capabilities";

type Tab = "Today" | "Capture" | "Inbox" | "Settings";
const BusyContext = React.createContext(false);
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#123D38" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const busy = React.useContext(BusyContext);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        editable={!busy}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#768782"
        multiline={multiline}
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: "top" },
        ]}
        autoCorrect={multiline}
      />
    </View>
  );
}
const blankTask = (): Task => ({
  id: randomUUID(),
  title: "",
  topic: "Life",
  minutes: 15,
  done: false,
  plannedDate: "",
  plannedTime: "",
  deadline: "",
  waitingOn: "",
  chaseDate: "",
  notes: "",
  createdAt: new Date().toISOString(),
  timeZone: deviceTimeZone(),
  reminderMinutes: 15,
});
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
export default function App() {
  return (
    <SafeAreaProvider>
      <Desk />
    </SafeAreaProvider>
  );
}
function Desk() {
  const [tab, setTab] = useState<Tab>("Today");
  const [tasks, setTasks] = useState<Task[]>([]),
    [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [minutes, setMinutes] = useState(30),
    [all, setAll] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [capture, setCapture] = useState("");
  const [editing, setEditing] = useState<Task | null>(null),
    [noteEdit, setNoteEdit] = useState<Note | null>(null);
  const [estimate, setEstimate] = useState("15");
  const refresh = useCallback(async () => {
    const data = await loadWorkspace();
    setTasks(data.tasks);
    setNotes(data.notes);
  }, []);
  const boot = useCallback(async () => {
    try {
      setLoadError("");
      await refresh();
      setReady(true);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [refresh]);
  useEffect(() => {
    void boot();
  }, [boot]);
  async function act(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit(task: Task) {
    if (lock.current) return;
    setMessage("");
    setEditing({ ...task });
    setEstimate(String(task.minutes));
  }
  const chooseCalendar: ChooseCalendar = (options, preferredId) => new Promise(resolve => {
    Alert.alert('Choose a calendar', 'New events go here. You can change this in Settings.', [
      ...options.map(option => ({ text: option.title + (option.id === preferredId ? ' (default)' : ''), onPress: () => resolve(option.id) })),
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: false });
  });
  function resetLink(task: Task) {
    Alert.alert('Reset calendar link?', 'This does not delete the existing Apple event. Only reset after checking Calendar; saving again can create a duplicate.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset link', style: 'destructive', onPress: () => void act(async () => { await resetCalendarLink(task.id); setMessage('Calendar link reset. Existing Apple events were not deleted.'); }) },
    ]);
  }
  const savedVoice = useCallback(
    async (note: SavedVoiceNote) => {
      // Reusing the recording URI makes retry after a refresh failure idempotent.
      await registerVoiceNote({
        ...note,
        id: note.audioUri,
        createdAt: new Date().toISOString(),
      });
      await refresh();
      setMessage("Voice note saved to your inbox.");
    },
    [refresh],
  );
  const due = tasks
    .filter((t) => !t.done && t.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const visible = all ? tasks : todayTasks(tasks, minutes);
  function remove(task: Task) {
    Alert.alert("Delete this action?", task.title, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void act(async () => {
            await removeTask(task.id);
            setEditing(null);
            await refresh();
          }),
      },
    ]);
  }
  async function exportText() {
    if (!(await Sharing.isAvailableAsync()))
      throw new Error("Sharing is not available on this device.");
    const file = new File(Paths.cache, "anchor-text-export.json");
    file.write(
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          tasks,
          notes: notes.map(({ audioUri, id, ...n }) => ({
            ...n,
            id: audioUri ? undefined : id,
            hasAudio: !!audioUri,
          })),
        },
        null,
        2,
      ),
    );
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Export Anchor notes and actions",
    });
  }
  if (!ready)
    return (
      <SafeAreaView style={s.shell}>
        <View style={s.center}>
          <Text style={s.logo}>⚓ Anchor</Text>
          {loadError ? (
            <>
              <Text style={s.body}>
                Could not open your saved workspace: {loadError}
              </Text>
              <Button title="Retry" onPress={() => void boot()} />
            </>
          ) : (
            <ActivityIndicator color="#176C5F" />
          )}
        </View>
      </SafeAreaView>
    );
  return (
    <BusyContext.Provider value={busy}>
      <SafeAreaView style={s.shell} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <View>
            <Text style={s.logo}>⚓ Anchor</Text>
            <Text style={s.small}>One next step.</Text>
          </View>
          <View style={s.badge}>
            <Text style={s.badgeText}>ON THIS DEVICE</Text>
          </View>
        </View>
        {!!message && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            onPress={() => setMessage("")}
            style={s.notice}
          >
            <Text accessibilityLiveRegion="polite" style={s.noticeText}>
              {message}
            </Text>
          </Pressable>
        )}
        <View style={[s.screen, tab !== "Today" && s.hidden]}>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.eyebrow}>
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </Text>
            <Text style={s.h1}>Make room for{"\n"}what matters.</Text>
            <Text style={s.body}>
              Choose the time you have. Start with one action.
            </Text>
            <View style={s.focus}>
              <Text style={s.sectionTitle}>I have a moment</Text>
              <View style={s.row}>
                {[15, 30, 60, 120].map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: minutes === m }}
                    onPress={() => {
                      setMinutes(m);
                      setAll(false);
                    }}
                    style={[s.chip, minutes === m && s.chipSelected]}
                  >
                    <Text
                      style={[s.chipText, minutes === m && s.chipTextSelected]}
                    >
                      {m === 120 ? "2 hr" : m + " min"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.small}>
                Each action fits your window; this is not an automatic schedule.
              </Text>
            </View>
            {due.length > 0 && (
              <View style={s.deadlines}>
                <Text style={s.sectionTitle}>Hard deadlines</Text>
                {due.map((t) => (
                  <Pressable
                    accessibilityRole="button"
                    key={t.id}
                    onPress={() => edit(t)}
                    style={{ paddingVertical: 7 }}
                  >
                    <Text style={s.label}>
                      {t.deadline} · {t.title}
                    </Text>
                    <Text style={s.small}>
                      {t.deadline < localDate()
                        ? "Overdue"
                        : t.deadline === localDate()
                          ? "Due today"
                          : "Keep this date in view"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={s.split}>
              <Text style={s.sectionTitle}>
                {all ? "All actions" : "Your next actions"}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setAll(!all)}
              >
                <Text style={s.link}>{all ? "Show today" : "View all"}</Text>
              </Pressable>
            </View>
            {visible.length === 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>
                  {tasks.length
                    ? "Nothing fits this window."
                    : "A little less in your head."}
                </Text>
                <Text style={s.body}>
                  {tasks.length
                    ? "Try a larger window or view all your actions."
                    : "Add one small action or capture a thought for later."}
                </Text>
              </View>
            )}
            {visible.map((t) => (
              <View key={t.id} style={[s.card, t.done && { opacity: 0.6 }]}>
                <View style={s.split}>
                  <Text style={s.topic}>
                    {t.topic} · {t.minutes} min
                  </Text>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={"Complete " + t.title}
                    accessibilityState={{ checked: t.done }}
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await saveTask({ ...t, done: !t.done });
                        await refresh();
                      })
                    }
                    style={s.check}
                  >
                    <Text style={s.checkText}>{t.done ? "✓" : "○"}</Text>
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" onPress={() => edit(t)}>
                  <Text style={s.taskTitle}>{t.title}</Text>
                  {!!t.notes && (
                    <Text numberOfLines={2} style={s.body}>
                      {t.notes}
                    </Text>
                  )}
                </Pressable>
                {!!t.plannedDate && (
                  <Text style={s.small}>
                    Planned {t.plannedDate}
                    {t.plannedTime ? " at " + t.plannedTime : ""}
                  </Text>
                )}
                {!!t.waitingOn && (
                  <Text style={s.small}>
                    Waiting on {t.waitingOn}
                    {t.chaseDate ? " · follow up " + t.chaseDate : ""}
                  </Text>
                )}
                <View style={s.split}>
                  <Pressable accessibilityRole="button" onPress={() => edit(t)}>
                    <Text style={s.link}>Edit action</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      void act(async () =>
                        setMessage(await addTaskToCalendar(t, chooseCalendar)),
                      )
                    }
                  >
                    <Text style={s.link}>{Platform.OS === "ios" ? "Save to Apple Calendar" : "Add to calendar ↗"}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Button
              title="＋ Add an action"
              onPress={() => edit(blankTask())}
            />
          </ScrollView>
        </View>
        <View style={[s.screen, tab !== "Capture" && s.hidden]}>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.eyebrow}>CAPTURE FIRST · ORGANIZE LATER</Text>
            <Text style={s.h1}>Let it out.</Text>
            <Text style={s.body}>A thought doesn't need a plan yet.</Text>
            <View style={s.card}>
              <Field
                label="What's on your mind?"
                value={capture}
                onChangeText={setCapture}
                placeholder="An idea, a thing to chase, something to remember…"
                multiline
              />
              <Button
                title="Save thought"
                disabled={busy || !capture.trim()}
                onPress={() =>
                  void act(async () => {
                    await saveNote({
                      id: randomUUID(),
                      title: capture.trim().split("\n")[0].slice(0, 100),
                      text: capture.trim(),
                      createdAt: new Date().toISOString(),
                    });
                    setCapture("");
                    await refresh();
                    setMessage("Thought saved. You can organize it later.");
                  })
                }
              />
            </View>
            <VoiceCapture onSaved={savedVoice} />
          </ScrollView>
        </View>
        <View style={[s.screen, tab !== "Inbox" && s.hidden]}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.eyebrow}>YOUR THOUGHT INBOX</Text>
            <Text style={s.h1}>Nothing lost.</Text>
            <Text style={s.body}>
              Review a thought and decide on one next step.
            </Text>
            {notes.length === 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Room for your ideas.</Text>
                <Text style={s.body}>
                  Your saved voice and text notes will appear here.
                </Text>
                <Button
                  title="Capture a thought"
                  onPress={() => setTab("Capture")}
                />
              </View>
            )}
            {notes.map((n) => (
              <View key={n.id} style={s.card}>
                <Text style={s.small}>
                  {new Date(n.createdAt).toLocaleString()}
                </Text>
                <Text style={s.taskTitle}>{n.title}</Text>
                {!!n.text && <Text style={s.body}>{n.text}</Text>}
                {!!n.audioUri && (
                  <>
                    <AudioPlayback uri={n.audioUri} />
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() =>
                        void act(async () => {
                          if (!(await Sharing.isAvailableAsync()))
                            throw new Error("Sharing is not available.");
                          await Sharing.shareAsync(n.audioUri!);
                        })
                      }
                    >
                      <Text style={s.link}>Share original audio ↗</Text>
                    </Pressable>
                  </>
                )}
                <View style={s.split}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setMessage("");
                      setNoteEdit({ ...n });
                    }}
                  >
                    <Text style={s.link}>Edit note</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      edit({ ...blankTask(), ...extractContactDetails(n.text), title: n.title, notes: n.text })
                    }
                  >
                    <Text style={s.link}>Create an action →</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={[s.screen, tab !== "Settings" && s.hidden]}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.eyebrow}>A FOUNDATION TO BUILD ON</Text>
            <Text style={s.h1}>Your space.</Text>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Mobile starter · 0.1.0</Text>
              <Text style={s.body}>{capabilities.cloudSync.reason}</Text>
              <Text style={s.body}>
                Deleting the app removes its local workspace. Export text and
                share original recordings to keep copies.
              </Text>
              <Button
                title="Export notes & actions"
                secondary
                disabled={busy}
                onPress={() => void act(exportText)}
              />
              <Text style={s.small}>
                The JSON export excludes audio files. Share each recording from
                your inbox.
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Calendar</Text>
              <Text style={s.body}>
                On iPhone, allow Calendar access and choose a calendar once. Save
                creates or updates the linked event, including contacts, location,
                meeting link, and alert. Apple delivers alerts according to your
                Calendar notification and Focus settings. Changes made in Calendar
                do not sync back here; saving changed details here replaces the
                linked event's details. Android uses its calendar editor.
              </Text>
              {Platform.OS === 'ios' && <Button title="Choose Apple calendar" secondary disabled={busy} onPress={() => void act(async () => { const id = await chooseAppleCalendar(chooseCalendar, true); setMessage(id ? 'Calendar chosen for new events.' : 'Calendar selection canceled.'); })} />}
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Future connections</Text>
              <Text style={s.body}>{capabilities.transcription.reason}</Text>
              <Text style={s.body}>{capabilities.purchases.reason}</Text>
              <Text style={s.small}>
                Cloud accounts, subscriptions, and background listening are not
                enabled. Calendar alerts are handled by your phone's Calendar app.
              </Text>
            </View>
          </ScrollView>
        </View>
        <View style={s.nav}>
          {(["Today", "Capture", "Inbox", "Settings"] as Tab[]).map(
            (name, i) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === name }}
                accessibilityLabel={name}
                key={name}
                onPress={() => setTab(name)}
                style={s.navItem}
              >
                <Text style={[s.navIcon, tab === name && s.active]}>
                  {["◉", "＋", "▤", "⚙"][i]}
                </Text>
                <Text style={[s.navText, tab === name && s.active]}>
                  {name}
                </Text>
              </Pressable>
            ),
          )}
        </View>
        <Modal
          visible={!!editing}
          animationType="slide"
          onRequestClose={() => !busy && setEditing(null)}
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={s.shell}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ScrollView
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.h1}>One next step.</Text>
                {editing && (
                  <>
                    <Field
                      label="Action"
                      value={editing.title}
                      onChangeText={(title) =>
                        setEditing({ ...editing, title })
                      }
                      placeholder="Start with a verb"
                    />
                    <View style={s.row}>
                      {TOPICS.map((topic) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: editing.topic === topic,
                          }}
                          key={topic}
                          disabled={busy}
                          style={[
                            s.chip,
                            editing.topic === topic && s.chipSelected,
                          ]}
                          onPress={() => setEditing({ ...editing, topic })}
                        >
                          <Text
                            style={[
                              s.chipText,
                              editing.topic === topic && s.chipTextSelected,
                            ]}
                          >
                            {topic}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Field
                      label="Minutes needed"
                      value={estimate}
                      onChangeText={setEstimate}
                    />
                    <Field
                      label="Plan to work on (optional)"
                      value={editing.plannedDate}
                      onChangeText={(plannedDate) =>
                        setEditing({ ...editing, plannedDate })
                      }
                      placeholder="YYYY-MM-DD"
                    />
                    <Field
                      label="Planned time (optional)"
                      value={editing.plannedTime}
                      onChangeText={(plannedTime) =>
                        setEditing({ ...editing, plannedTime })
                      }
                      placeholder="HH:mm · 24-hour time"
                    />
                    <Field label="Time zone" value={editing.timeZone || deviceTimeZone()} onChangeText={timeZone => setEditing({ ...editing, timeZone })} placeholder="America/New_York" />
                    <Text style={s.label}>Calendar alert</Text>
                    <View style={s.row}>
                      {REMINDERS.map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{selected: (editing.reminderMinutes === undefined ? 15 : editing.reminderMinutes) === value}} disabled={busy} style={[s.chip, (editing.reminderMinutes === undefined ? 15 : editing.reminderMinutes) === value && s.chipSelected]} onPress={() => setEditing({...editing, reminderMinutes: value})}><Text style={[s.chipText, (editing.reminderMinutes === undefined ? 15 : editing.reminderMinutes) === value && s.chipTextSelected]}>{reminderLabel(value)}</Text></Pressable>)}
                    </View>
                    <Field label="Contact name (optional)" value={editing.contactName || ''} onChangeText={contactName => setEditing({...editing, contactName})} />
                    <Field label="Phone (optional)" value={editing.phone || ''} onChangeText={phone => setEditing({...editing, phone})} />
                    <Field label="Email (optional)" value={editing.email || ''} onChangeText={email => setEditing({...editing, email})} />
                    <Field label="Location / address (optional)" value={editing.location || ''} onChangeText={location => setEditing({...editing, location})} />
                    <Field label="Meeting or website link (optional)" value={editing.meetingUrl || ''} onChangeText={meetingUrl => setEditing({...editing, meetingUrl})} placeholder="https://…" />
                    <Field
                      label="Hard deadline (optional)"
                      value={editing.deadline}
                      onChangeText={(deadline) =>
                        setEditing({ ...editing, deadline })
                      }
                      placeholder="YYYY-MM-DD"
                    />
                    <Field
                      label="Waiting on (optional)"
                      value={editing.waitingOn}
                      onChangeText={(waitingOn) =>
                        setEditing({ ...editing, waitingOn })
                      }
                    />
                    <Field
                      label="Follow-up date (optional)"
                      value={editing.chaseDate}
                      onChangeText={(chaseDate) =>
                        setEditing({ ...editing, chaseDate })
                      }
                      placeholder="YYYY-MM-DD"
                    />
                    <Field
                      label="Context"
                      value={editing.notes}
                      onChangeText={(notes) =>
                        setEditing({ ...editing, notes })
                      }
                      multiline
                    />
                    {!!message && (
                      <Text style={s.error} accessibilityLiveRegion="polite">
                        {message}
                      </Text>
                    )}
                    <Button
                      title="Save action"
                      disabled={busy}
                      onPress={() =>
                        void act(async () => {
                          await saveTask({
                            ...editing,
                            title: editing.title.trim(),
                            minutes: Number(estimate),
                          });
                          await refresh();
                          setEditing(null);
                          setMessage("Action saved.");
                        })
                      }
                    />
                    <Button
                      title="Cancel"
                      secondary
                      disabled={busy}
                      onPress={() => {
                        setEditing(null);
                        setMessage("");
                      }}
                    />
                    {Platform.OS === 'ios' && tasks.some(t => t.id === editing.id) && <Button title="Reset calendar link…" secondary disabled={busy} onPress={() => resetLink(editing)} />}
                    {tasks.some((t) => t.id === editing.id) && (
                      <Button
                        title="Delete action"
                        secondary
                        disabled={busy}
                        onPress={() => remove(editing)}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
        <Modal
          visible={!!noteEdit}
          animationType="slide"
          onRequestClose={() => !busy && setNoteEdit(null)}
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={s.shell}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ScrollView
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.h1}>Keep the context.</Text>
                {noteEdit && (
                  <>
                    <Field
                      label="Title"
                      value={noteEdit.title}
                      onChangeText={(title) =>
                        setNoteEdit({ ...noteEdit, title })
                      }
                    />
                    <Field
                      label="Text or transcript"
                      value={noteEdit.text}
                      onChangeText={(text) =>
                        setNoteEdit({ ...noteEdit, text })
                      }
                      multiline
                    />
                    {!!message && <Text style={s.error}>{message}</Text>}
                    <Button
                      title="Save note"
                      disabled={busy}
                      onPress={() =>
                        void act(async () => {
                          await saveNote(noteEdit);
                          await refresh();
                          setNoteEdit(null);
                        })
                      }
                    />
                    <Button
                      title="Cancel"
                      secondary
                      disabled={busy}
                      onPress={() => setNoteEdit(null)}
                    />
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </BusyContext.Provider>
  );
}
const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: "#F6F8F5" },
  screen: { flex: 1 },
  hidden: { display: "none" },
  center: { flex: 1, justifyContent: "center", padding: 30, gap: 25 },
  header: {
    paddingHorizontal: 23,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#DFE7E1",
  },
  logo: {
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#143D36",
  },
  small: { fontSize: 12, lineHeight: 18, color: "#63796F" },
  badge: { backgroundColor: "#E2EEE5", padding: 8, borderRadius: 20 },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#3D6957",
    letterSpacing: 1,
  },
  content: { padding: 22, paddingBottom: 35, gap: 18 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: "#668272",
    textTransform: "uppercase",
  },
  h1: {
    fontSize: 35,
    fontWeight: "700",
    letterSpacing: -1.5,
    color: "#153E36",
    lineHeight: 40,
  },
  body: { fontSize: 15, lineHeight: 23, color: "#61746A" },
  focus: { backgroundColor: "#E5F0DA", borderRadius: 22, padding: 20, gap: 14 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: "#EFF3EB",
    borderWidth: 1,
    borderColor: "#CDDCCB",
  },
  chipSelected: { backgroundColor: "#204D41", borderColor: "#204D41" },
  chipText: { color: "#345948", fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  card: {
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E0E8DF",
    gap: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#24473B" },
  split: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  link: {
    fontSize: 13,
    color: "#287363",
    fontWeight: "700",
    paddingVertical: 8,
  },
  topic: {
    fontSize: 11,
    fontWeight: "700",
    color: "#738576",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  taskTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "600",
    color: "#29493B",
  },
  check: {
    padding: 5,
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { fontSize: 27, color: "#368570" },
  button: {
    backgroundColor: "#1F6555",
    borderRadius: 15,
    padding: 16,
    alignItems: "center",
    minHeight: 50,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  secondary: { backgroundColor: "#E7EDE5" },
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "600", color: "#365446" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#CDDBCF",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#203F32",
    minHeight: 48,
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#DDE5DA",
    backgroundColor: "#FAFCF8",
    paddingTop: 8,
    paddingBottom: 5,
  },
  navItem: { flex: 1, alignItems: "center", gap: 3, padding: 7, minHeight: 56 },
  navText: { fontSize: 10, fontWeight: "600", color: "#7D8A7C" },
  navIcon: { fontSize: 23, color: "#8C978A" },
  active: { color: "#216D56" },
  notice: {
    backgroundColor: "#E0EDDA",
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  noticeText: { fontSize: 13, lineHeight: 19, color: "#295443" },
  error: { fontSize: 14, color: "#AA403B" },
  deadlines: {
    backgroundColor: "#FBF0DE",
    padding: 18,
    borderRadius: 18,
    gap: 4,
  },
});
