import React, { useEffect, useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import type { Task } from "../model.ts";
import { localDate } from "../model.ts";
import type { ThoughtDraft } from "../drafts.ts";
import { Button, Chips, Field, Sheet } from "./ui.tsx";
import { C } from "./theme.ts";

/** Things' Jump Start: day chips, time, due, project, minutes, and the sentence it came from. Save rewrites everything. */
export default function MoveSheet({ task, projects, now = new Date(), onSave, onDelete, onClose, onOpenSource }: { task: Task | null; projects: ThoughtDraft[]; now?: Date; onSave: (patch: { title: string; plannedDate: string; plannedTime: string; deadline: string; minutes: number; projectId?: string }) => void; onDelete: () => void; onClose: () => void; onOpenSource?: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [due, setDue] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDate(task.plannedDate ?? "");
    setTime(task.plannedTime ?? "");
    setDue(task.deadline ?? "");
    setMinutes(task.minutes || 20);
    setProjectId(task.projectId);
  }, [task?.id]);
  if (!task) return null;
  const today = localDate(now);
  const days = Array.from({ length: 6 }, (_, i) => localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  const dayLabel = (d: string, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }));
  const dayChips = [...days.map(dayLabel), "Someday"];
  const dayValue = date === "" ? "Someday" : days.includes(date) ? dayLabel(date, days.indexOf(date)) : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  const times = ["9:00", "12:00", "14:00", "17:00", "19:00"];
  const timeValue = time ? (time.startsWith("0") ? time.slice(1) : time) : "";
  const dueChips = ["None", ...days.slice(0, 5).map(dayLabel)];
  const dueValue = due === "" ? "None" : days.includes(due) ? dayLabel(due, days.indexOf(due)) : due;
  const isWaiting = task.kind === "waiting";
  return (
    <Sheet visible={!!task} onClose={onClose}>
      <TextInput value={title} onChangeText={setTitle} accessibilityLabel="Move title" style={s.title} multiline />
      {!isWaiting && (
        <>
          <Text style={s.label}>DAY</Text>
          <Chips items={dayChips} value={dayValue} onChange={(v) => setDate(v === "Someday" ? "" : days[dayChips.indexOf(v)])} />
          <Text style={s.label}>TIME</Text>
          <Chips items={["Any", ...times]} value={timeValue || "Any"} onChange={(v) => setTime(v === "Any" ? "" : v.padStart(5, "0"))} />
          <Text style={s.label}>DUE</Text>
          <Chips items={dueChips} value={dueValue} onChange={(v) => setDue(v === "None" ? "" : days[dueChips.indexOf(v) - 1])} />
          <Text style={s.label}>TAKES</Text>
          <Chips items={["10 min", "20 min", "30 min", "1 hour"]} value={minutes >= 60 ? "1 hour" : `${minutes} min`} onChange={(v) => setMinutes(v === "1 hour" ? 60 : Number(v))} />
        </>
      )}
      {isWaiting && <Field label="Waiting on" value={task.waitingOn || "someone"} />}
      {isWaiting && <Field label="Chase" value={task.chaseDate ? new Date(`${task.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", day: "numeric" }) : "—"} />}
      {projects.length > 0 && (
        <>
          <Text style={s.label}>PROJECT</Text>
          <Chips items={["None", ...projects.map((p) => p.title.slice(0, 22))]} value={projectId ? (projects.find((p) => p.id === projectId)?.title.slice(0, 22) ?? "None") : "None"} onChange={(v) => setProjectId(v === "None" ? undefined : projects.find((p) => p.title.slice(0, 22) === v)?.id)} />
        </>
      )}
      {!!task.notes && <Field label="From" value={`“${task.notes.slice(0, 60)}${task.notes.length > 60 ? "…" : ""}” ↗`} onPress={onOpenSource} />}
      <View style={{ height: 6 }} />
      <Button label="Save" onPress={() => onSave({ title: title.trim() || task.title, plannedDate: date, plannedTime: time, deadline: due, minutes, projectId })} />
      <Button label="Delete" onPress={onDelete} quiet />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700", color: C.ink, paddingVertical: 6, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair },
  label: { fontSize: 11, letterSpacing: 1.2, fontWeight: "700", color: C.ink3, marginTop: 8 },
});
