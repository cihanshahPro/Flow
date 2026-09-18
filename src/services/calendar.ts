import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import { calendarDraft, type Task } from "../model";

// The system editor lets the person choose the calendar and confirm the event.
// Deliberately does not request full calendar read access or promise synchronization.
export async function addTaskToCalendar(task: Task): Promise<string> {
  if (Platform.OS === "web")
    throw new Error("Calendar access needs the iPhone or Android app.");
  const result = await Calendar.createEventInCalendarAsync(calendarDraft(task));
  if (Platform.OS === "android")
    return "Calendar editor closed. Check your calendar to confirm the event was saved.";
  return result.action === "saved"
    ? "Event saved to your calendar."
    : "Calendar closed without saving a new event.";
}
