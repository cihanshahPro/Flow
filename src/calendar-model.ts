import { validateTask, type Task } from './model.ts';

export const REMINDERS = [null, 0, 5, 15, 30, 60, 1440] as const;
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
export function reminderLabel(minutes: number | null): string {
  return minutes === null ? 'No alert' : minutes === 0 ? 'At start' : minutes === 1440 ? '1 day before' : minutes === 60 ? '1 hour before' : `${minutes} minutes before`;
}
function parts(date: Date, zone: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (key: string) => Number(p.find(v => v.type === key)?.value);
  return [get('year'), get('month'), get('day'), get('hour'), get('minute'), get('second')];
}
export function scheduledInstant(date: string, time: string, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const instant = wall + h * 3600000;
    const [y, mo, d, hr, mi, sec] = parts(new Date(instant), zone);
    offsets.add(Date.UTC(y, mo - 1, d, hr, mi, sec) - instant);
  }
  const matches = [...offsets].map(offset => new Date(wall - offset)).filter(candidate => {
    const [y, mo, d, hr, mi] = parts(candidate, zone);
    return y === year && mo === month && d === day && hr === hour && mi === minute;
  });
  if (!matches.length) throw new Error('This local time does not exist because the clocks change. Choose another time.');
  if (matches.length > 1) throw new Error('This local time occurs twice because the clocks change. Choose a time outside the repeated hour.');
  return matches[0];
}
export function contactDetails(task: Task): string {
  return [
    task.contactName?.trim() && `Contact: ${task.contactName.trim()}`,
    task.phone?.trim() && `Phone: ${task.phone.trim()}`,
    task.email?.trim() && `Email: ${task.email.trim()}`,
    task.meetingUrl?.trim() && `Meeting / website: ${task.meetingUrl.trim()}`,
    task.waitingOn?.trim() && `Waiting on: ${task.waitingOn.trim()}`,
    task.deadline && `Hard deadline: ${task.deadline}`,
    task.chaseDate && `Follow-up date: ${task.chaseDate}`,
    task.notes?.trim(),
  ].filter(Boolean).join('\n\n');
}
export function eventDraft(task: Task) {
  validateTask(task);
  if (!task.plannedDate || !task.plannedTime) throw new Error('Edit this action and add a planned date and time first.');
  const timeZone = task.timeZone || deviceTimeZone();
  const startDate = scheduledInstant(task.plannedDate, task.plannedTime, timeZone);
  const reminder = task.reminderMinutes === undefined ? 15 : task.reminderMinutes;
  return {
    title: task.title.trim(), startDate,
    endDate: new Date(startDate.getTime() + task.minutes * 60000),
    timeZone, allDay: false,
    location: task.location?.trim() || '',
    url: task.meetingUrl?.trim() || '',
    notes: [contactDetails(task), `Anchor reference: ${task.id}`].filter(Boolean).join('\n\n'),
    alarms: reminder === null ? [] : [{ relativeOffset: reminder === 0 ? 0 : -reminder }],
  };
}
export function calendarFingerprint(task: Task): string {
  return JSON.stringify(eventDraft(task));
}

// Copy only contact details actually present in the original text. These remain editable.
export function extractContactDetails(text: string): Pick<Task, 'email' | 'phone' | 'meetingUrl'> {
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const phone = text.match(/\b(?:phone|tel|telephone|mobile|call)[\s:]+(\+?[\d(][\d() .-]{5,}\d(?:\s*(?:ext\.?|x)\s*\d+)?)/i)?.[1]?.trim();
  const meetingUrl = text.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.;!?]+$/, '');
  return { email, phone: phone && phone.replace(/\D/g, '').length >= 7 ? phone : undefined, meetingUrl };
}
