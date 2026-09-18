import { eventDraft, calendarFingerprint } from './calendar-model.ts';
import type { Task } from './model.ts';

export type CalendarLink = { taskId: string; calendarId: string; eventId?: string; fingerprint: string; state: 'pending' | 'saved'; startDate: string; endDate: string };
export type CalendarPort = {
  readLink: (id: string) => Promise<CalendarLink | null>;
  writeLink: (link: CalendarLink) => Promise<void>;
  findEvent: (link: CalendarLink) => Promise<string | null>;
  exists: (id: string) => Promise<boolean>;
  create: (calendarId: string, draft: ReturnType<typeof eventDraft>) => Promise<string>;
  update: (id: string, draft: ReturnType<typeof eventDraft>) => Promise<unknown>;
};
// Global task locks also cover callers outside the main screen's button lock.
const active = new Set<string>();
export async function saveCalendarTask(task: Task, calendarId: string, port: CalendarPort) {
  if (active.has(task.id)) throw new Error('This action is already being saved to Calendar.');
  active.add(task.id);
  try {
    const draft = eventDraft(task);
    const fingerprint = calendarFingerprint(task);
    let previous = await port.readLink(task.id);
    if (previous?.state === 'pending') {
      const recovered = await port.findEvent(previous);
      if (!recovered) throw new Error('A previous save could not be confirmed. Check Apple Calendar before resetting this action’s calendar link.');
      previous = { ...previous, eventId: recovered, state: 'saved' };
      await port.writeLink(previous);
    }
    if (previous?.eventId) {
      if (!(await port.exists(previous.eventId))) throw new Error('The linked event is no longer available. Check Calendar, then reset the link if you want to create a new event.');
      if (previous.fingerprint === fingerprint) return { action: 'unchanged' as const, eventId: previous.eventId };
      // A failed update can be safely retried against the same event ID.
      await port.update(previous.eventId, draft);
      await port.writeLink({ ...previous, fingerprint, startDate: draft.startDate.toISOString(), endDate: draft.endDate.toISOString() });
      return { action: 'updated' as const, eventId: previous.eventId };
    }
    const pending: CalendarLink = { taskId: task.id, calendarId, fingerprint, state: 'pending', startDate: draft.startDate.toISOString(), endDate: draft.endDate.toISOString() };
    // Persist intent before the OS write; uncertain outcomes must never blindly create twice.
    await port.writeLink(pending);
    const eventId = await port.create(calendarId, draft);
    if (!eventId) throw new Error('Calendar did not return an event ID. Check Calendar before trying again.');
    await port.writeLink({ ...pending, eventId, state: 'saved' });
    return { action: 'created' as const, eventId };
  } finally { active.delete(task.id); }
}
