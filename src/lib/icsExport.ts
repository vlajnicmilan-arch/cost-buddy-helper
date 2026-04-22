/**
 * Generate an ICS (iCalendar) file from reminder data and trigger download.
 */

import { exportTextFile, type ExportMode } from '@/lib/fileExport';

interface ReminderEvent {
  id: string;
  title: string;
  description?: string;
  remind_at: string; // ISO 8601
  type?: string;
}

export interface CalendarEventForICS {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD or ISO
  amount?: number;
  type?: string;
  source?: string;
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function generateICS(events: ReminderEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//V&M Balance//Reminders//HR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const start = new Date(event.remind_at);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@vmbalance`);
    lines.push(`DTSTART:${formatICSDate(start)}`);
    lines.push(`DTEND:${formatICSDate(end)}`);
    lines.push(`SUMMARY:${escapeICS(event.title)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
    }
    lines.push(`CATEGORIES:${event.type || 'custom'}`);
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT15M');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICS(event.title)}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function downloadICS(events: ReminderEvent[], filename = 'reminders.ics', mode: ExportMode = 'save'): Promise<void> {
  const icsContent = generateICS(events);
  await exportTextFile(icsContent, filename, 'text/calendar', false, mode);
}

function mapCalendarEventToReminder(event: CalendarEventForICS): ReminderEvent {
  const desc = [event.description, event.amount != null ? `Iznos: ${event.amount}` : ''].filter(Boolean).join(' • ');
  return {
    id: event.id,
    title: event.title,
    description: desc || undefined,
    remind_at: event.date.includes('T') ? event.date : `${event.date}T09:00:00`,
    type: event.type || 'custom',
  };
}

export async function downloadCalendarEventICS(event: CalendarEventForICS, mode: ExportMode = 'save'): Promise<void> {
  const reminder = mapCalendarEventToReminder(event);
  const safeName = event.title.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_').substring(0, 30);
  await downloadICS([reminder], `${safeName}.ics`, mode);
}

export async function downloadCalendarEventsICS(events: CalendarEventForICS[], filename = 'calendar.ics', mode: ExportMode = 'save'): Promise<void> {
  const reminders = events.map(mapCalendarEventToReminder);
  await downloadICS(reminders, filename, mode);
}
