import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { WeekPlan as Plan } from "../services/intake.ts";
import { weekDays } from "../calendar.ts";
import { dayItems } from "./Upcoming.tsx";
import { Button, Dot, Fab, Row, Screen, Section } from "./ui.tsx";
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
  const days = weekDays(now, 7).map((date) => ({ date, items: dayItems(plan.events, plan.tasks, date) })).filter((d) => d.items.length);
  return (
    <Screen title="Your week" subtitle={`from what you just said · ${n} thing${n === 1 ? "" : "s"}, all placed`} fab={<Fab onRecord={onRecord} onWrite={onWrite} busy={busy} />}>
      {!!plan.summary && <Text style={s.lead}>{plan.summary}</Text>}
      {days.map((d) => {
        const dd = new Date(`${d.date}T12:00:00`);
        return (
          <Section key={d.date} label={`${dd.toLocaleDateString("en-US", { weekday: "short" })} ${dd.getDate()}`}>
            {d.items.map((it, i) => (
              <Row key={it.key} first={i === 0} title={it.title} when={it.when} lead={<Dot color={it.kind === "flow" ? C.accent : it.kind === "chase" ? C.amber : C.violet} />} />
            ))}
          </Section>
        );
      })}
      {(moved.length > 0 || later.length > 0) && (
        <Section label="Placed around your week">
          {moved.map((p, i) => (
            <Row key={`m${i}`} first={i === 0} title={p.item.title} sub={p.note} lead={<Dot color={C.accent} />} />
          ))}
          {later.map((p, i) => (
            <Row key={`l${i}`} first={moved.length === 0 && i === 0} title={`Later: ${p.item.title}`} lead={<Dot />} />
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
  closure: { marginHorizontal: 20, marginTop: 22, backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  closureText: { color: C.green, fontSize: 14.5, fontWeight: "600", lineHeight: 20 },
});
