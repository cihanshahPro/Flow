import React from "react";
import { View } from "react-native";
import type { Task } from "../model.ts";
import { localDate } from "../model.ts";
import { timeLabel, type CalEvent, type WatchOut } from "../calendar.ts";
import { Check, Dot, Empty, Fab, Notice, Pill, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/**
 * Today, in Things' shape: CALENDAR · MOVES · THIS EVENING · WAITING ON.
 * Rows you can tick, swipe and tap. One Record button. Nothing else.
 */
export default function Today({
  events,
  tasks,
  tomorrow = [],
  build,
  notice = "",
  error = "",
  busy = false,
  now = new Date(),
  onTick,
  onOpenMove,
  onTomorrow,
  onEvening,
  onDelete,
  onRecord,
  onWrite,
  onDismissNotice,
  calendar,
}: {
  events: CalEvent[];
  tasks: Task[];
  /** Tomorrow's watch-outs, shown under CALENDAR with a pill. */
  tomorrow?: WatchOut[];
  build?: string;
  notice?: string;
  error?: string;
  busy?: boolean;
  now?: Date;
  onTick: (task: Task) => void;
  onOpenMove: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onEvening: (task: Task) => void;
  onDelete: (task: Task) => void;
  onRecord: () => void;
  onWrite: () => void;
  onDismissNotice: () => void;
  calendar?: { connected: boolean; onConnect: () => void };
}) {
  const today = localDate(now);
  const isEvening = (t: Task) => (t.plannedTime ? Number(t.plannedTime.slice(0, 2)) >= 17 : false);
  const mine = tasks.filter((t) => t.kind !== "waiting" && !t.later && (t.plannedDate === today || (t.done && t.completedAt?.slice(0, 10) === today)));
  const moves = mine.filter((t) => !isEvening(t)).sort((a, b) => Number(a.done) - Number(b.done) || (a.plannedTime || "99").localeCompare(b.plannedTime || "99"));
  const evening = mine.filter(isEvening).sort((a, b) => Number(a.done) - Number(b.done));
  const waiting = tasks.filter((t) => t.kind === "waiting" && !t.done && (!t.chaseDate || t.chaseDate <= localDate(new Date(now.getTime() + 6 * 864e5))));
  const onCalendar = events.filter((e) => !e.mine && localDate(new Date(e.start)) <= today && localDate(new Date(new Date(e.end).getTime() - 1)) >= today);
  const dayName = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
  const label = (t: Task) => (t.done ? "done" : t.plannedTime ? t.plannedTime : "");
  const acts = (t: Task) => (t.done ? undefined : [
    { label: "Tomorrow", color: C.ink2, onPress: () => onTomorrow(t) },
    { label: "Evening", color: C.accent, onPress: () => onEvening(t) },
    { label: "Delete", color: C.red, onPress: () => onDelete(t) },
  ]);
  const moveRow = (t: Task, i: number) => (
    <Row
      key={t.id}
      first={i === 0}
      title={t.title}
      sub={[t.projectId ? undefined : t.area, t.minutes ? `${t.minutes} min` : undefined, t.deadline && !t.done ? undefined : undefined].filter(Boolean).join(" · ") || undefined}
      when={label(t)}
      done={t.done}
      lead={<Check on={t.done} onPress={() => onTick(t)} label={t.done ? `Reopen ${t.title}` : `Done: ${t.title}`} />}
      trailing={t.deadline && !t.done ? <Pill text={`by ${new Date(`${t.deadline}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}`} tone={t.deadline <= localDate(new Date(now.getTime() + 2 * 864e5)) ? "red" : "amber"} /> : undefined}
      onPress={() => onOpenMove(t)}
      actions={acts(t)}
      accessibilityLabel={`Open move ${t.title}`}
    />
  );
  return (
    <Screen
      title="Today"
      subtitle={`${dayName} · ${onCalendar.length} event${onCalendar.length === 1 ? "" : "s"} · ${moves.length + evening.length} move${moves.length + evening.length === 1 ? "" : "s"}${build ? " · " + build : ""}`}
      fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}
    >
      {!!error && <Notice text={error} tone="red" onDismiss={onDismissNotice} />}
      {!!notice && <Notice text={notice} onDismiss={onDismissNotice} />}
      {calendar && !calendar.connected && (
        <Section label="Your week">
          <Row first title="Connect your calendar" sub="Apple and Google, through the phone — Flow plans around it" when="›" onPress={calendar.onConnect} accessibilityLabel="Connect calendar" />
        </Section>
      )}
      {(onCalendar.length > 0 || tomorrow.length > 0) && (
        <Section label="Calendar">
          {onCalendar.map((e, i) => (
            <Row key={e.id} first={i === 0} title={e.title} when={e.allDay ? "all day" : timeLabel(e.start)} lead={<Dot color={C.violet} />} />
          ))}
          {tomorrow.map((w, i) => (
            <Row key={`${w.kind}-${i}`} first={onCalendar.length === 0 && i === 0} title={w.title} sub={w.note} lead={<Dot color={C.violet} />} trailing={<Pill text="watch" />} />
          ))}
        </Section>
      )}
      <Section label="Moves">
        {moves.length === 0 && evening.length === 0 ? <Empty text="Nothing planned for today. Record what's on your mind." /> : moves.map(moveRow)}
      </Section>
      {evening.length > 0 && <Section label="This evening">{evening.map(moveRow)}</Section>}
      {waiting.length > 0 && (
        <Section label="Waiting on">
          {waiting.map((t, i) => (
            <Row
              key={t.id}
              first={i === 0}
              title={t.title}
              sub={`${t.waitingOn}${t.chaseDate ? ` · chase ${new Date(`${t.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}` : ""}`}
              lead={<Dot color={C.amber} />}
              onPress={() => onOpenMove(t)}
              actions={[
                { label: "Got it", color: C.green, onPress: () => onTick(t) },
                { label: "Delete", color: C.red, onPress: () => onDelete(t) },
              ]}
              accessibilityLabel={`Open waiting ${t.title}`}
            />
          ))}
        </Section>
      )}
      <View style={{ height: 40 }} />
    </Screen>
  );
}
