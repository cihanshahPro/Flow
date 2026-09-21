import React from "react";
import { Pressable, Text, View } from "react-native";
import { eventsOn, timeLabel, watchOuts, weekDays, type CalEvent } from "../calendar.ts";
import { localDate, type Task } from "../model.ts";
import { DayBlock, Dot, Fab, Pill, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/** Everything on one day, in order: the phone's events, Flow's moves (blue), chases (amber). */
export function dayItems(events: CalEvent[], tasks: Task[], date: string) {
  const on = eventsOn(events, date);
  const flowRefs = new Set(on.filter((e) => e.mine && e.ref).map((e) => e.ref));
  const moves = tasks.filter((t) => !t.done && !t.later && t.kind !== "waiting" && t.plannedDate === date && !flowRefs.has(t.id));
  const chases = tasks.filter((t) => !t.done && t.kind === "waiting" && t.chaseDate === date);
  const items: { key: string; title: string; when: string; sort: string; kind: "event" | "flow" | "chase"; task?: Task; allDay?: boolean }[] = [];
  for (const e of on) {
    const task = e.mine ? tasks.find((t) => t.id === e.ref) : undefined;
    items.push({ key: e.id, title: e.title.replace(/^✓\s*/, ""), when: e.allDay ? "all day" : timeLabel(e.start), sort: e.allDay ? "00:00" : new Date(e.start).toTimeString().slice(0, 5), kind: e.mine ? "flow" : "event", task, allDay: e.allDay });
  }
  for (const t of moves) items.push({ key: t.id, title: t.title, when: t.plannedTime || "any time", sort: t.plannedTime || "23:58", kind: "flow", task: t });
  if (chases.length) items.push({ key: `chase-${date}`, title: `Chase: ${chases.map((t) => t.waitingOn).join(" · ")}`, when: "", sort: "23:59", kind: "chase", task: chases[0] });
  return items.sort((a, b) => a.sort.localeCompare(b.sort));
}

/**
 * The week as Flow sees it: what to watch out for first, then the days down
 * the page, each with the phone's events and Flow's items. Tap a Flow item
 * to change it.
 */
export default function CalendarTab({
  events,
  tasks,
  connected,
  busy = false,
  now = new Date(),
  days = 10,
  onConnect,
  onOpenMove,
  onRecord,
  onWrite,
  onSeed,
}: {
  events: CalEvent[];
  tasks: Task[];
  connected: boolean;
  busy?: boolean;
  now?: Date;
  days?: number;
  onConnect: () => void;
  onOpenMove: (task: Task) => void;
  onRecord: () => void;
  onWrite: () => void;
  onSeed?: () => void;
}) {
  const list = weekDays(now, days);
  const today = localDate(now);
  const watch = watchOuts(events, now, 7);
  const sources = [...new Set(events.filter((e) => !e.mine).map((e) => e.calendar).filter(Boolean))];
  return (
    <Screen
      title="Calendar"
      subtitle={connected ? `${sources.length ? sources.slice(0, 2).join(" + ") : "your calendar"} · Flow in blue` : "connect your calendar"}
      right={
        onSeed ? (
          <Pressable onLongPress={onSeed} delayLongPress={1200} accessibilityLabel="Dev seed" hitSlop={10}>
            <Text style={{ color: C.paper }}>·</Text>
          </Pressable>
        ) : undefined
      }
      fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}
    >
      {!connected && (
        <Section label="Your week">
          <Row first title="Connect your calendar" sub="Apple and Google, through the phone — Flow plans around it" when="›" onPress={onConnect} accessibilityLabel="Connect calendar" />
        </Section>
      )}
      {watch.length > 0 && (
        <Section label="Watch out">
          {watch.map((w, i) => (
            <Row key={`${w.kind}-${w.date}-${i}`} first={i === 0} title={w.title} sub={w.note} lead={<Dot color={C.violet} />} trailing={<Pill text={w.kind === "full" ? "full" : w.kind === "trip" ? "away" : w.kind === "occasion" ? "nothing planned" : "watch"} tone={w.kind === "important" ? "red" : "amber"} />} />
          ))}
        </Section>
      )}
      {list.map((date, i) => {
        const items = dayItems(events, tasks, date);
        return (
          <DayBlock
            key={date}
            date={date}
            today={date === today}
            first={i === 0}
            items={
              items.length
                ? items.map((it) => ({ key: it.key, text: `${it.title}${it.when ? " · " + it.when : ""}`, kind: it.kind, onPress: it.task ? () => onOpenMove(it.task!) : undefined, accessibilityLabel: it.task ? `Open move ${it.title}` : it.title }))
                : [{ key: "empty", text: "nothing planned yet", kind: "empty" as const }]
            }
          />
        );
      })}
      <View style={{ height: 40 }} />
    </Screen>
  );
}
