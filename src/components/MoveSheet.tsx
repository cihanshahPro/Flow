import React, { useEffect, useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import type { Task } from "../model.ts";
import { localDate } from "../model.ts";
import type { ThoughtDraft } from "../drafts.ts";
import { Button, Chips, Field, Sheet } from "./ui.tsx";
import { isGenericTitle } from "./Recordings.tsx";
import { C } from "./theme.ts";

/**
 * Things' Jump Start: the day as chips, then Time · Due · Project · Takes as
 * fields that open to chips, and the sentence it came from. Save rewrites
 * the task, its calendar event and its reminder together.
 */
export default function MoveSheet({ task, projects, now = new Date(), onSave, onDelete, onClose, onOpenSource }: { task: Task | null; projects: ThoughtDraft[]; now?: Date; onSave: (patch: { title: string; plannedDate: string; plannedTime: string; deadline: string; minutes: number; projectId?: string }) => void; onDelete: () => void; onClose: () => void; onOpenSource?: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [due, setDue] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<"time" | "due" | "project" | "takes" | null>(null);
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDate(task.plannedDate ?? "");
    setTime(task.plannedTime ?? "");
    setDue(task.deadline ?? "");
    setMinutes(task.minutes || 20);
    setProjectId(task.projectId);
    setOpen(null);
  }, [task?.id]);
  if (!task) return null;
  const days = Array.from({ length: 6 }, (_, i) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  const dayLabel = (d: string, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }));
  const dayChips = [...days.map(dayLabel), "Someday"];
  const dayValue = date === "" ? "Someday" : days.includes(date) ? dayLabel(date, days.indexOf(date)) : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  const times = ["9:00", "12:00", "14:00", "17:00", "19:00"];
  const clock = (t: string) => {
    if (!t) return "Any time";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  const dueChips = ["None", ...days.slice(0, 5).map((d, i) => `by ${dayLabel(d, i)}`)];
  const dueValue = due === "" ? "None" : days.includes(due) ? `by ${dayLabel(due, days.indexOf(due))}` : `by ${due}`;
  const dueText = due === "" ? "None" : `${new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })} ${new Date(`${due}T12:00:00`).getDate()}`;
  const takes = minutes >= 60 ? "1 hour" : `${minutes} min`;
  const isWaiting = task.kind === "waiting";
  // Live projects only: not resolved, not named after an area; the current one always listed.
  const live = projects.filter((p) => p.id === projectId || (!p.resolvedAt && !isGenericTitle(p.title))).slice(0, 12);
  const projectTitle = projectId ? (projects.find((p) => p.id === projectId)?.title ?? "None") : "None";
  const flip = (k: typeof open) => setOpen((o) => (o === k ? null : k));
  return (
    <Sheet visible={!!task} onClose={onClose}>
      <TextInput value={title} onChangeText={setTitle} accessibilityLabel="Move title" style={s.title} multiline />
      {!isWaiting && (
        <>
          <Chips items={dayChips} value={dayValue} onChange={(v) => setDate(v === "Someday" ? "" : days[dayChips.indexOf(v)])} />
          <Field label="Time" value={clock(time)} onPress={() => flip("time")} />
          {open === "time" && <Chips items={["Any time", ...times.map((t) => clock(t.padStart(5, "0")))]} value={clock(time)} onChange={(v) => { setTime(v === "Any time" ? "" : times[times.map((t) => clock(t.padStart(5, "0"))).indexOf(v)].padStart(5, "0")); setOpen(null); }} />}
          <Field label="Due" value={dueText} onPress={() => flip("due")} />
          {open === "due" && <Chips items={dueChips} value={dueValue} onChange={(v) => { setDue(v === "None" ? "" : days[dueChips.indexOf(v) - 1]); setOpen(null); }} />}
        </>
      )}
      {isWaiting && <Field label="Waiting on" value={task.waitingOn || "someone"} />}
      {isWaiting && <Field label="Chase" value={task.chaseDate ? new Date(`${task.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", day: "numeric" }) : "—"} />}
      {live.length > 0 && <Field label="Project" value={projectTitle} onPress={() => flip("project")} />}
      {open === "project" && (
        <Chips
          items={["None", ...live.map((p) => p.title.slice(0, 22))]}
          value={projectId ? (live.find((p) => p.id === projectId)?.title.slice(0, 22) ?? "None") : "None"}
          onChange={(v) => {
            setProjectId(v === "None" ? undefined : live.find((p) => p.title.slice(0, 22) === v)?.id);
            setOpen(null);
          }}
        />
      )}
      {!isWaiting && <Field label="Takes" value={takes} onPress={() => flip("takes")} />}
      {open === "takes" && <Chips items={["10 min", "20 min", "30 min", "1 hour"]} value={takes} onChange={(v) => { setMinutes(v === "1 hour" ? 60 : parseInt(v, 10) || 20); setOpen(null); }} />}
      {!!task.notes && <Field label="From" value={`“${task.notes.slice(0, 60)}${task.notes.length > 60 ? "…" : ""}” ↗`} onPress={onOpenSource} />}
      <View style={{ height: 6 }} />
      <Button label="Save" onPress={() => onSave({ title: title.trim() || task.title, plannedDate: date, plannedTime: time, deadline: due, minutes, projectId })} />
      <Button label="Delete" accessibilityLabel="Delete this move" onPress={onDelete} quiet />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700", color: C.ink, paddingVertical: 6, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  label: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700", color: C.ink3, marginTop: 8 },
});
