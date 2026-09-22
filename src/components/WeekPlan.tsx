import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { WeekPlan as Plan } from "../services/intake.ts";
import { eventsOn, weekDays } from "../calendar.ts";
import { dayItems } from "./CalendarTab.tsx";
import { Button, DayBlock, Dot, Fab, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

/**
 * After a dump: the week with everything placed, the same rows as Upcoming,
 * then why things moved, then closure. The Record button is there; nothing
 * is asked.
 */
export default function WeekPlan({ plan, busy = false, now = new Date(), onOpenProject, onRecord, onWrite, onDone }: { plan: Plan; busy?: boolean; now?: Date; onOpenProject: (id: string) => void; onRecord: () => void; onWrite?: () => void; onDone: () => void }) {
  const n = plan.placements.length;
  const moved = plan.placements.filter((p) => p.note);
  const later = plan.placements.filter((p) => p.item.kind === "later");
  // Days Flow kept clear: trips and full days in the coming week.
  const away = (plan.watch ?? []).filter((w) => w.kind === "trip" || w.kind === "full").filter((w, i, all) => all.findIndex((x) => x.date === w.date) === i).slice(0, 3);
  // The week shows the phone's events and what this recording added; what was already planned is one grey line per day.
  const fresh = new Set(plan.tasks.map((t) => t.id));
  const shown = plan.events.filter((e) => !e.mine || (e.ref && fresh.has(e.ref)));
  const days = weekDays(now, 7)
    .map((date) => ({ date, items: dayItems(shown, plan.tasks, date), already: plan.events.filter((e) => e.mine && !(e.ref && fresh.has(e.ref)) && eventsOn([e], date).length).length }))
    .filter((d) => d.items.length);
  const subtitle = n ? `from what you just said · ${n} thing${n === 1 ? "" : "s"}, all placed${plan.known ? ` · ${plan.known} already there` : ""}` : plan.known ? `from what you just said · ${plan.known} thing${plan.known === 1 ? "" : "s"} already on your week` : "from what you just said";
  return (
    <Screen title="Your week" subtitle={subtitle} fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}>
      {!!plan.summary && <Text style={s.lead}>{plan.summary}</Text>}
      {days.map((d, i) => (
        <DayBlock key={d.date} date={d.date} today={i === 0 && d.date === weekDays(now, 1)[0]} first={i === 0} items={d.items.map((it) => ({ key: it.key, text: `${it.title}${it.when ? " · " + it.when : ""}`, kind: it.kind }))} footer={d.already > 0 ? `+ ${d.already} already planned` : undefined} />
      ))}
      {(moved.length > 0 || later.length > 0 || away.length > 0) && (
        <Section label="Placed around your week">
          {moved.map((p, i) => (
            <Row key={`m${i}`} first={i === 0} title={`${p.item.title} → ${p.slot ? `${new Date(p.slot.start).toLocaleDateString("en-US", { weekday: "short" })} ${new Date(p.slot.start).toTimeString().slice(0, 5)}` : p.date ? new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : p.chaseDate ? `chase ${new Date(`${p.chaseDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}` : ""}`} sub={p.note} lead={<Dot color={C.accent} />} />
          ))}
          {away.map((w, i) => (
            <Row key={`w${i}`} first={moved.length === 0 && i === 0} title={`Nothing on ${new Date(`${w.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}`} sub={w.kind === "trip" ? `you're away · ${w.title}` : w.note} lead={<Dot color={C.violet} />} />
          ))}
          {later.map((p, i) => (
            <Row key={`l${i}`} first={moved.length === 0 && away.length === 0 && i === 0} title={`Later: ${p.item.title}`} sub={p.note ?? (p.item.when ? `after ${p.item.when}` : undefined)} lead={<Dot />} />
          ))}
        </Section>
      )}
      {plan.projects.filter((p) => p.fresh).length > 0 && (
        <Section label="Projects">
          {plan.projects.filter((p) => p.fresh).map((p, i) => (
            <Row key={p.id} first={i === 0} title={p.title} sub={p.area} when="›" onPress={() => onOpenProject(p.id)} accessibilityLabel={`Open thread ${p.title}`} />
          ))}
        </Section>
      )}
      <View style={s.closure}>
        <Text style={s.closureText}>✓ {plan.closure}</Text>
      </View>
      <Button label="Looks right" onPress={onDone} quiet busy={busy} />
      <View style={{ height: 60 }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 15, lineHeight: 22, color: C.ink, paddingHorizontal: 20, paddingTop: 10 },
  already: { fontSize: 12, fontWeight: "500", color: C.ink3, paddingHorizontal: 20, paddingTop: 8 },
  closure: { marginHorizontal: 20, marginTop: 18 },
  closureText: { color: C.green, fontSize: 15, fontWeight: "700", lineHeight: 21 },
});
