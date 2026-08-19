/**
 * TIHA OBAVIJEST NA DUPLIKAT — čuvar oblika.
 *
 * Živi slučaj (19.8.2026, 03:39): korisnik je drugi put ovoga tjedna
 * proslijedio Izvadak 027 jer je mislio da pošta nije stigla. Lijevak je
 * ispravno odbacio duplikat — i šutio.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import { resolveNotificationRoute } from '@/lib/notificationPayload';

const src = readFileSync('supabase/functions/mail-process/index.ts', 'utf8');

describe('mail-process javlja duplikat', () => {
  it('duplikat grana zove tihu obavijest', () => {
    const branch = src.slice(src.indexOf('if (dedup.kind === "duplicate")'));
    expect(branch.slice(0, 1600)).toContain('notifyDuplicate(supabase, ownerId, messageId');
  });

  it('obavijest je dedupirana po poruci i nosi tip mail_document_duplicate', () => {
    expect(src).toContain('`mail_document_duplicate:${messageId}`');
    expect(src).toContain('type: "mail_document_duplicate"');
  });

  it('BEZ PUSHA — duplikat je informacija, ne uzbuna', () => {
    const fn = src.slice(src.indexOf('async function notifyDuplicate'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toContain('send-push');
    expect(body).not.toContain('functions.invoke');
  });

  it('poštuje bránu starosti (nema retroaktivnog vala)', () => {
    const branch = src.slice(src.indexOf('if (dedup.kind === "duplicate")'), src.indexOf('const userClassification'));
    expect(branch).toContain('if (notifyAllowed)');
  });

  it('prvi (ne-duplikat) dolazak ne zove ovu obavijest', () => {
    const enteredReview = src.slice(src.indexOf('const enteredReview'));
    expect(enteredReview.slice(0, 600)).not.toContain('notifyDuplicate');
  });
});

describe('tekstovi i usmjeravanje', () => {
  it('sva tri jezika imaju ključeve', () => {
    for (const cat of [hr, en, de] as Array<Record<string, any>>) {
      const d = cat.notifications.mail.duplicate;
      expect(typeof d.title).toBe('string');
      expect(d.body).toContain('{{subject}}');
      expect(typeof d.bodyNoSubject).toBe('string');
    }
  });

  it('vodi na Dokumente', () => {
    const p = resolveNotificationRoute({ type: 'mail_document_duplicate', data: {} } as any);
    expect(p.route).toBe('/dokumenti');
  });
});
