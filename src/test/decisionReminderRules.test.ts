import { describe, it, expect } from 'vitest';
import {
  decideReminderActions,
  FIRST_REMINDER_MS,
  OVERDUE_MS,
  DAILY_REMINDER_MS,
} from '@/lib/decisionReminderRules';

const now = new Date('2026-07-15T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('decideReminderActions', () => {
  it('vraća praznu listu ako je aktivnost svježa (<12h) i nije overdue', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(2 * 60 * 60 * 1000),
      overdue: false,
      lastReminderSentAt: null,
    })).toEqual([]);
  });

  it('okida first_reminder na točno 12h bez ranijeg podsjetnika', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(FIRST_REMINDER_MS),
      overdue: false,
      lastReminderSentAt: null,
    })).toEqual(['first_reminder']);
  });

  it('NE okida first_reminder ako je već poslan (last_reminder != null) unutar prozora 12-24h', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(FIRST_REMINDER_MS + 60_000),
      overdue: false,
      lastReminderSentAt: ago(60_000),
    })).toEqual([]);
  });

  it('na 24h okida mark_overdue + daily_reminder (push objema stranama + prva dnevna)', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(OVERDUE_MS),
      overdue: false,
      lastReminderSentAt: null,
    })).toEqual(['mark_overdue', 'daily_reminder']);
  });

  it('na 24h prelazi u overdue čak i ako je first_reminder već slan', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(OVERDUE_MS + 60_000),
      overdue: false,
      lastReminderSentAt: ago(12 * 60 * 60 * 1000),
    })).toEqual(['mark_overdue', 'daily_reminder']);
  });

  it('overdue + zadnji podsjetnik prije 12h → ništa (dnevni prag nije dosegnut)', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(2 * OVERDUE_MS),
      overdue: true,
      lastReminderSentAt: ago(12 * 60 * 60 * 1000),
    })).toEqual([]);
  });

  it('overdue + zadnji podsjetnik prije 24h → dnevni podsjetnik', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(3 * OVERDUE_MS),
      overdue: true,
      lastReminderSentAt: ago(DAILY_REMINDER_MS),
    })).toEqual(['daily_reminder']);
  });

  it('overdue + last_reminder_sent_at NULL (rijedak edge) → dnevni podsjetnik', () => {
    expect(decideReminderActions({
      now,
      lastActivityAt: ago(3 * OVERDUE_MS),
      overdue: true,
      lastReminderSentAt: null,
    })).toEqual(['daily_reminder']);
  });
});
