/**
 * REGRESIJA: sirovi i18n ključ na laptopu.
 *
 * „Za pažnju" je imao vlastitu kopiju razrješavanja ključeva (heuristika
 * „nema razmaka + ima točku") koja je zaobilazila `resolveNotificationText`.
 * Ovaj test drži oba uvjeta: jedini prevoditelj + prijevod s varijablama.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveNotificationText } from '@/lib/notificationI18n';
import i18n from '@/i18n';

const t = i18n.t.bind(i18n) as never;
const SRC = readFileSync('src/components/dashboard/ActiveIssuesSection.tsx', 'utf8');

describe('ActiveIssuesSection display path', () => {
  it('koristi središnji resolveNotificationText', () => {
    expect(SRC).toContain('resolveNotificationText');
  });

  it('nema lokalne heuristike za ključeve', () => {
    expect(SRC).not.toContain('raw.includes(" ")');
  });

  it('agregat s razradom se prikazuje prevedeno, ne kao ključ', () => {
    const out = resolveNotificationText(
      'attention.issues.overdueIncomingInvoices.messageWithBreakdown',
      { count: 83, amount: '3009.02 €', breakdown: 'Akrobat 82 · Tactura 1' },
      t,
    );
    expect(out).not.toContain('attention.issues');
    expect(out).toContain('3009.02 €');
    expect(out).toContain('Akrobat 82');
  });

  it('naslov s brojem se prikazuje prevedeno', () => {
    const out = resolveNotificationText(
      'attention.issues.overdueIncomingInvoices.title',
      { count: 83 },
      t,
    );
    expect(out).toContain('83');
    expect(out).not.toContain('attention.issues');
  });
});
