import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { timeLabel } from "../calendar.ts";
import type { Task } from "../model.ts";
import { EVERY_DAY, WEEKDAYS, type Decision, type Proposal, type Routine } from "../tomorrow.ts";
import { Button, Check, Chips, Dot, Empty, Fab, Pill, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/**
 * Plan tomorrow tonight. The calendar as it is, the routines the person
 * keeps, Flow's proposed moves and today's leftovers — each a row with a
 * check — one line to add more, and one button. Then the day is set.
 */
export default function PlanTomorrow({
  proposal,
  routines,
  suggestedLines = [],
  busy = false,
  onLock,
  onOpenMove,
  onBack,
  onTalk,
  onType,
}: {
  proposal: Proposal;
  /** Every routine the person has, on or off. */
  routines: Routine[];
  /** New lines Flow heard in what the person said about tomorrow. */
  suggestedLines?: string[];
  busy?: boolean;
  onLock: (decision: Decision) => void;
  onOpenMove: (task: Task) => void;
  onBack: () => void;
  /** Say what tomorrow holds; Flow connects it to the list. Nothing is saved as a recording. */
  onTalk: () => void;
  onType: () => void;
}) {
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [carry, setCarry] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [line, setLine] = useState("");
  const [mine, setMine] = useState<Routine[]>(routines);
  const [newRoutine, setNewRoutine] = useState(false);
  const [routineTitle, setRoutineTitle] = useState("");
  const [routineTime, setRoutineTime] = useState("07:00");
  useEffect(() => {
    setKeep(new Set(proposal.moves.map((t) => t.id)));
    setCarry((c) => new Set([...proposal.carry.map((t) => t.id), ...(proposal.suggested ?? []).map((t) => t.id), ...[...c].filter((id) => proposal.carry.some((t) => t.id === id) || proposal.suggested?.some((t) => t.id === id))]));
  }, [proposal.date, proposal.moves.length, proposal.carry.length, proposal.suggested?.length]);
  useEffect(() => {
    if (suggestedLines.length) setAdded((a) => [...a, ...suggestedLines.filter((l) => !a.includes(l))]);
  }, [suggestedLines]);
  useEffect(() => setMine(routines), [routines]);
  const d = new Date(`${proposal.date}T12:00:00`);
  const day = d.getDay();
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const flipRoutine = (r: Routine) => setMine((all) => all.map((x) => (x.id === r.id ? { ...x, on: !(x.on && x.days.includes(day)), days: x.days.includes(day) ? x.days : [...x.days, day].sort() } : x)));
  const addRoutine = () => {
    const title = routineTitle.trim();
    if (!title) return;
    setMine((all) => [...all, { id: `r-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`, title, time: routineTime, minutes: 20, days: routineTime < "12:00" ? EVERY_DAY : WEEKDAYS, on: true }]);
    setRoutineTitle("");
    setNewRoutine(false);
  };
  const addLine = () => {
    const text = line.trim();
    if (!text) return;
    setAdded((a) => [...a, text]);
    setLine("");
  };
  const total = keep.size + carry.size + added.length;
  const suggested = proposal.suggested ?? [];
  const onCount = mine.filter((r) => r.on && r.days.includes(day)).length;
  const hours = Math.round(proposal.freeMinutes / 30) / 2;
  return (
    <Screen
      title="Tomorrow"
      subtitle={`${d.toLocaleDateString("en-US", { weekday: "long" })} ${d.getDate()} · ${proposal.events.length} event${proposal.events.length === 1 ? "" : "s"} · ${hours}h free`}
      back="Today"
      onBack={onBack}
      footer={<Button label={total || onCount ? `Lock in tomorrow · ${total} move${total === 1 ? "" : "s"}${onCount ? ` · ${onCount} routine${onCount === 1 ? "" : "s"}` : ""}` : "Lock in tomorrow"} busy={busy} style={{ marginTop: 0 }} onPress={() => onLock({ keep: [...keep], carry: [...carry], added, routines: mine })} />}
      fab={<Fab onRecord={onTalk} onWrite={onType} label="Tell Flow" busy={busy} />}
    >
      <Text style={s.lead}>Say what tomorrow holds — Flow connects it to your list and suggests. Then lock it in and let it go.</Text>
      {(proposal.events.length > 0 || proposal.watch.length > 0) && (
        <Section label="Calendar">
          {proposal.events.map((e, i) => (
            <Row key={e.id} first={i === 0} title={e.title} when={e.allDay ? "all day" : timeLabel(e.start)} lead={<Dot color={C.violet} />} trailing={proposal.watch.some((w) => w.eventId === e.id) ? <Pill text="watch" /> : undefined} />
          ))}
          {proposal.watch.filter((w) => !w.eventId).map((w, i) => (
            <Row key={`w${i}`} first={proposal.events.length === 0 && i === 0} title={w.title} sub={w.note} lead={<Dot color={C.violet} />} trailing={<Pill text="watch" />} />
          ))}
        </Section>
      )}
      <Section label="Routine" right={onCount ? `${onCount} on` : undefined}>
        {mine.map((r, i) => {
          const on = r.on && r.days.includes(day);
          return <Row key={r.id} first={i === 0} title={r.title} sub={`${r.minutes} min · ${r.days.length === 7 ? "every day" : r.days.length === 5 ? "weekdays" : `${r.days.length} days a week`}`} when={r.time} lead={<Check on={on} onPress={() => flipRoutine(r)} label={`${on ? "Skip" : "Keep"} ${r.title} tomorrow`} />} onPress={() => flipRoutine(r)} accessibilityLabel={`Routine ${r.title}`} />;
        })}
        {newRoutine ? (
          <View style={s.add}>
            <TextInput value={routineTitle} onChangeText={setRoutineTitle} placeholder="Stretch, journal, water the plants…" placeholderTextColor={C.ink3} accessibilityLabel="New routine" style={s.input} autoFocus onSubmitEditing={addRoutine} returnKeyType="done" />
            <Chips items={["06:30", "07:00", "08:00", "12:30", "18:00", "21:30"]} value={routineTime} onChange={setRoutineTime} />
            <Button label="Add routine" onPress={addRoutine} quiet />
          </View>
        ) : (
          <Row title="Add a routine" sub="a small block you keep most days" when="+" onPress={() => setNewRoutine(true)} accessibilityLabel="Add a routine" />
        )}
      </Section>
      <Section label="Moves" right={total ? String(total) : undefined}>
        <View style={s.add}>
          <TextInput value={line} onChangeText={setLine} placeholder="Add a move for tomorrow…" placeholderTextColor={C.ink3} accessibilityLabel="Add a move" style={s.input} onSubmitEditing={addLine} returnKeyType="done" blurOnSubmit={false} />
        </View>
        {added.map((a, i) => (
          <Row key={`a${i}`} first={i === 0} title={a} sub="new" lead={<Check on onPress={() => setAdded((all) => all.filter((_, k) => k !== i))} label={`Remove ${a}`} />} />
        ))}
        {proposal.moves.length === 0 && proposal.carry.length === 0 && added.length === 0 && <Empty text="Nothing on tomorrow yet. Add what matters." />}
        {proposal.moves.map((t, i) => (
          <Row key={t.id} first={added.length === 0 && i === 0} title={t.title} sub={[t.area, t.minutes ? `${t.minutes} min` : ""].filter(Boolean).join(" · ")} when={t.plannedTime} lead={<Check on={keep.has(t.id)} onPress={() => setKeep(toggle(keep, t.id))} label={`${keep.has(t.id) ? "Drop" : "Keep"} ${t.title}`} />} onPress={() => onOpenMove(t)} accessibilityLabel={`Open move ${t.title}`} />
        ))}
        {suggested.map((t, i) => (
          <Row key={t.id} first={added.length === 0 && proposal.moves.length === 0 && i === 0} title={t.title} sub={`from your list${t.plannedDate ? " · was " + new Date(`${t.plannedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : ""}`} when="→" lead={<Check on={carry.has(t.id)} onPress={() => setCarry(toggle(carry, t.id))} label={`${carry.has(t.id) ? "Leave" : "Bring"} ${t.title}`} />} onPress={() => onOpenMove(t)} accessibilityLabel={`Open move ${t.title}`} />
        ))}
        {proposal.carry.filter((t) => !suggested.some((x) => x.id === t.id)).map((t, i) => (
          <Row key={t.id} first={added.length === 0 && proposal.moves.length === 0 && suggested.length === 0 && i === 0} title={t.title} sub="not done today" when="→" lead={<Check on={carry.has(t.id)} onPress={() => setCarry(toggle(carry, t.id))} label={`${carry.has(t.id) ? "Leave" : "Bring"} ${t.title}`} />} onPress={() => onOpenMove(t)} accessibilityLabel={`Open move ${t.title}`} />
        ))}
      </Section>
      {proposal.chases.length > 0 && (
        <Section label="Chase tomorrow">
          {proposal.chases.map((t, i) => (
            <Row key={t.id} first={i === 0} title={t.title} sub={t.waitingOn} lead={<Dot color={C.amber} />} onPress={() => onOpenMove(t)} accessibilityLabel={`Open waiting ${t.title}`} />
          ))}
        </Section>
      )}
      <View style={{ height: 30 }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 14.5, lineHeight: 21, color: C.ink2, paddingHorizontal: 20, paddingTop: 8 },
  add: { paddingHorizontal: 20, paddingVertical: 8, gap: 4 },
  input: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.ink },
});
