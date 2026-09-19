// SDK 57 moved this function API to /legacy; the root import now throws deprecation errors.
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';
import type { Task } from '../model';
import { eventDraft } from '../calendar-model';
import { saveCalendarTask, type CalendarLink } from '../calendar-save';
import { database } from './storage';

export type CalendarChoice = { id: string; title: string };
export type ChooseCalendar = (options: CalendarChoice[], preferredId?: string) => Promise<string | null>;
async function calendarDB() {
  const db = await database();
  await db.execAsync('CREATE TABLE IF NOT EXISTS calendar_links (task_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  return db;
}
export async function getCalendarLink(id: string): Promise<CalendarLink | null> {
  const row = await (await calendarDB()).getFirstAsync<{payload: string}>('SELECT payload FROM calendar_links WHERE task_id=?', id);
  return row ? JSON.parse(row.payload) : null;
}
async function writeLink(link: CalendarLink) {
  await (await calendarDB()).runAsync('INSERT INTO calendar_links(task_id,payload) VALUES(?,?) ON CONFLICT(task_id) DO UPDATE SET payload=excluded.payload', link.taskId, JSON.stringify(link));
}
export async function resetCalendarLink(id: string) {
  await (await calendarDB()).runAsync('DELETE FROM calendar_links WHERE task_id=?', id);
}
async function permission() {
  if (!(await Calendar.isAvailableAsync())) throw new Error('Calendar is not available on this device.');
  let p = await Calendar.getCalendarPermissionsAsync();
  if (!p.granted && p.canAskAgain) p = await Calendar.requestCalendarPermissionsAsync();
  if (!p.granted) throw new Error('Calendar access is off. Enable it for Anchor in iPhone Settings to save and update your events.');
}
export async function chooseAppleCalendar(choose: ChooseCalendar, force = false): Promise<string | null> {
  await permission();
  const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter(c => c.allowsModifications);
  if (!calendars.length) throw new Error('No writable calendar is available. Add an account or calendar in Apple Calendar first.');
  const db = await calendarDB();
  const saved = await db.getFirstAsync<{value: string}>('SELECT value FROM preferences WHERE key=?', 'calendar');
  if (!force && saved && calendars.some(c => c.id === saved.value)) return saved.value;
  const defaultCalendar = await Calendar.getDefaultCalendarAsync().catch(() => null);
  const selected = await choose(calendars.map(c => ({id: c.id, title: `${c.title}${c.source?.name ? ` · ${c.source.name}` : ''}`})), defaultCalendar?.id);
  if (!selected) return null;
  if (!calendars.some(c => c.id === selected)) throw new Error('Choose an available writable calendar.');
  await db.runAsync('INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'calendar', selected);
  return selected;
}
export async function addTaskToCalendar(task: Task, choose: ChooseCalendar): Promise<string> {
  const draft = eventDraft(task); // Validate before asking for device permissions.
  if (Platform.OS === 'web') throw new Error('Direct Apple Calendar access needs the iPhone app.');
  if (Platform.OS !== 'ios') {
    await Calendar.createEventInCalendarAsync(draft);
    return 'Calendar editor closed. Check the event and alert in your calendar to confirm they were saved.';
  }
  const calendarId = await chooseAppleCalendar(choose);
  if (!calendarId) return 'Calendar selection canceled. Nothing was added.';
  const result = await saveCalendarTask(task, calendarId, {
    readLink: getCalendarLink, writeLink,
    findEvent: async link => {
      const events = await Calendar.getEventsAsync([link.calendarId], new Date(new Date(link.startDate).getTime() - 86400000), new Date(new Date(link.endDate).getTime() + 86400000));
      const matches = events.filter(e => e.notes?.split('\n').includes(`Anchor reference: ${link.taskId}`));
      if (matches.length > 1) throw new Error('More than one matching event exists. Review Apple Calendar before resetting the link.');
      return matches[0]?.id || null;
    },
    exists: async id => Boolean((await Calendar.getEventAsync(id)).id),
    create: (id, data) => Calendar.createEventAsync(id, data),
    update: (id, data) => Calendar.updateEventAsync(id, data),
  });
  return result.action === 'unchanged' ? 'Already saved to Apple Calendar. No duplicate was created.' : result.action === 'updated' ? 'Apple Calendar event updated with these details and alert setting.' : 'Saved to Apple Calendar with these details and alert setting.';
}
