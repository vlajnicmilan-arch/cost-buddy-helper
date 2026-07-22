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

const tPassthrough = (key: string, opts?: Record<string, unknown>) => {
  // minimalni mock — resolveNotificationText koristi realni i18n.exists
  // pa fallbackira na key ako prijevod ne postoji.
  if (opts && typeof opts === 'object') {
    return Object.entries(opts).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
      key,
    );
  }
  return key;
};

describe('notification key resolution before browser display', () => {
  it('prevodi poznati i18n ključ (ne curi šifra u UI)', () => {
    const raw = 'notifications.milestone_deadline.overdue.title';
    const out = resolveNotificationText(raw, { name: 'Bojanje' }, tPassthrough as any);
    expect(out).not.toBe(raw);
    expect(out).toContain('Bojanje');
  });

  it('literal tekst prolazi netaknut (starije obavijesti)', () => {
    const out = resolveNotificationText('⚠️ Faza „Bojanje" je istekla', {}, tPassthrough as any);
    expect(out).toBe('⚠️ Faza „Bojanje" je istekla');
  });

  it('nepoznati ključ vraća raw (defenzivno, ne baca)', () => {
    const out = resolveNotificationText('notifications.nepostojeci.kljuc', {}, tPassthrough as any);
    expect(out).toBe('notifications.nepostojeci.kljuc');
  });
});
