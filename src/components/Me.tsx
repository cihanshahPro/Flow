import React from "react";
import { Linking, Switch, Text, View } from "react-native";
import type { PhoneCalendar } from "../services/calendar-read.ts";
import { Dot, Row, Screen, Section } from "./ui.tsx";
import { C } from "./theme.ts";

export const PRIVACY_URL = "https://kodavena.com/flowthread/privacy";

/** "08:30" moved by `delta` minutes, wrapping around midnight. */
export function shiftTime(time: string, delta: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Me: the calendars Flow plans around, the ways in (Reminders, Siri, share
 * sheet, widget), the two rhythm times, and the data. No gear anywhere else.
 */
export default function Me({
  name,
  recordings,
  projects,
  calendars,
  calendarConnected,
  remindersConnected,
  notificationsOn = true,
  morningTime = "08:30",
  eveningTime = "19:00",
  version = "",
  busy = false,
  onConnectCalendar,
  onCalendar,
  onConnectReminders,
  onNotifications,
  onMorning,
  onEvening,
  onFeedback,
  onExport,
  onDeleteAll,
  onDevReminder,
  onDevScheduled,
  cloud,
}: {
  name?: string;
  recordings: number;
  projects: number;
  calendars: PhoneCalendar[];
  calendarConnected: boolean;
  remindersConnected: boolean;
  notificationsOn?: boolean;
  morningTime?: string;
  eveningTime?: string;
  version?: string;
  busy?: boolean;
  onConnectCalendar: () => void;
  onCalendar: (id: string, on: boolean) => void;
  onConnectReminders: () => void;
  onNotifications: (on: boolean) => void;
  onMorning: (time: string) => void;
  onEvening: (time: string) => void;
  onFeedback: (mode: "voice" | "text") => void;
  onExport: () => void;
  onDeleteAll: () => void;
  onDevReminder?: () => void;
  onDevScheduled?: () => void;
  /** Older phones: shape on a secure server. Absent when the phone shapes on-device. */
  cloud?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const subtitle = [name, `${recordings} recording${recordings === 1 ? "" : "s"}`, `${projects} project${projects === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
  const timeRow = (label: string, time: string, onChange: (t: string) => void, first = false) => (
    <Row
      first={first}
      title={label}
      when={clock(time)}
      trailing={
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Text accessibilityRole="button" accessibilityLabel={`${label} earlier by 30 minutes`} onPress={() => onChange(shiftTime(time, -30))} style={{ color: C.accent, fontSize: 18, fontWeight: "700" }}>−</Text>
          <Text accessibilityRole="button" accessibilityLabel={`${label} later by 30 minutes`} onPress={() => onChange(shiftTime(time, 30))} style={{ color: C.accent, fontSize: 18, fontWeight: "700" }}>+</Text>
        </View>
      }
    />
  );
  return (
    <Screen title="Me" subtitle={subtitle}>
      <Section label="Calendars Flow plans around">
        {!calendarConnected && <Row first title="Connect your calendar" sub="Apple and Google, through the phone" when="›" onPress={onConnectCalendar} accessibilityLabel="Connect calendar" />}
        {calendarConnected && calendars.length === 0 && <Row first title="No calendars on this phone" sub="Add one in Settings › Calendar" />}
        {calendars.map((c, i) => (
          <Row
            key={c.id}
            first={i === 0}
            title={c.title}
            sub={`${c.source || "on this phone"}${c.on ? "" : " · off, not planned around"}`}
            lead={<Dot color={c.color || C.violet} />}
            trailing={<Switch accessibilityLabel={`Plan around ${c.title}`} value={c.on} onValueChange={(v) => onCalendar(c.id, v)} disabled={busy} />}
          />
        ))}
      </Section>
      <Section label="Ways in">
        <Row first title="Reminders" sub={remindersConnected ? 'chases in the "Flow" list · ticks sync back' : "chases land in Apple Reminders"} when={remindersConnected ? "ON" : "›"} onPress={remindersConnected ? undefined : onConnectReminders} accessibilityLabel="Reminders" />
        <Row title='Siri · "Tell Flow…"' sub="Shortcut · works from the Action button" when="SOON" />
        <Row title="Share sheet" sub="send an email or message to Flow" when="SOON" />
        <Row title="Lock-screen widget" sub="your next move" when="SOON" />
        <Row title="Notifications" sub="your day at morning, day closed at evening" trailing={<Switch accessibilityLabel="Notifications" value={notificationsOn} onValueChange={onNotifications} disabled={busy} />} />
        {cloud && <Row title="Shape notes on a secure server" sub="only the text, never the audio · nothing stored" trailing={<Switch accessibilityLabel="Shape notes on a secure server" value={cloud.on} onValueChange={cloud.onChange} disabled={busy} />} />}
      </Section>
      <Section label="Rhythm">
        {timeRow("Morning plan", morningTime, onMorning, true)}
        {timeRow("Evening close", eveningTime, onEvening)}
      </Section>
      <Section label="Tell Flow something">
        <Row first title="Record feedback" sub="about Flow itself · stays on this phone" when="›" onPress={() => onFeedback("voice")} accessibilityLabel="Record feedback" />
        <Row title="Write feedback" when="›" onPress={() => onFeedback("text")} accessibilityLabel="Write feedback" />
      </Section>
      <Section label="Data">
        <Row first title="Export everything" when="›" onPress={onExport} accessibilityLabel="Export my data" />
        <Row title="Privacy policy" when="›" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityLabel="Privacy policy" />
        <Row title="Delete everything" when="›" onPress={onDeleteAll} accessibilityLabel="Delete all my data" />
        {onDevReminder && <Row title="Send a test reminder (dev)" when="›" onPress={onDevReminder} accessibilityLabel="Send a test reminder" />}
        {onDevScheduled && <Row title="Scheduled pushes (dev)" when="›" onPress={onDevScheduled} accessibilityLabel="Scheduled pushes" />}
        {!!version && <Row title={`Flowthread ${version}`} />}
      </Section>
      <View style={{ height: 40 }} />
    </Screen>
  );
}
