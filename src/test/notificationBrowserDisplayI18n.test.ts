/**
 * Regresijski test: sistemska/browser obavijest MORA prevesti i18n ključ
 * prije prikaza (inače korisnik vidi šifru poput
 * "notifications.milestone_deadline.overdue.title").
 * Bug: useNotifications je pozivao showBrowserNotification s neprevedenim
 * newNotification.title/message.
 */
import { describe, it, expect } from 'vitest';
import { resolveNotificationText } from '@/lib/notificationI18n';
import '@/i18n';

import i18n from '@/i18n';

const t = i18n.t.bind(i18n);

describe('notification key resolution before browser display', () => {
  it('prevodi poznati i18n ključ (ne curi šifra u UI)', () => {
    const raw = 'notifications.milestone_deadline.overdue.title';
    const out = resolveNotificationText(raw, { name: 'Bojanje' }, t as any);
    expect(out).not.toBe(raw);
    expect(out).toContain('Bojanje');
  });

  it('literal tekst prolazi netaknut (starije obavijesti)', () => {
    const literal = '⚠️ Faza „Bojanje" je istekla';
    const out = resolveNotificationText(literal, {}, t as any);
    expect(out).toBe(literal);
  });

  it('nepoznati ključ vraća raw (defenzivno, ne baca)', () => {
    const raw = 'notifications.nepostojeci.kljuc';
    const out = resolveNotificationText(raw, {}, t as any);
    expect(out).toBe(raw);
  });
});
