/**
 * SALDO PRIPADA IZVODU, NE PUTU KOJIM JE UŠAO.
 *
 * Živi kvar (19.8.2026): Revolut uvezen s DISKA — izvod nosi završni saldo u
 * „Sažetku salda", ali ponuda „Poravnaj sa stanjem s izvoda" nije došla
 * (`imported_statements.reconciliation_state` NULL), pa je novčanik ostao
 * netočan do ručnog uređivanja.
 *
 * Čuvar drži DVIJE stvari:
 *  1. isti deterministički čitač zaglavlja vidi saldo u doslovnom Revolut
 *     tekstu i u Erste obliku („Novo stanje"),
 *  2. izvod bez salda ne proizvodi ponudu — nikakvo nagađanje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractStatementBalance } from '../../supabase/functions/_shared/mailImport/statementSignals.ts';
import { resolveStatementFallback } from '@/lib/importReview/executor';
import type { ImportReviewPayload } from '@/lib/importReview/types';

const revolutText = readFileSync('src/test/fixtures/revolutStatementFull.txt', 'utf8');

const payload = (closing: number | null, date: string | null): ImportReviewPayload =>
  ({
    jobId: 'job-1',
    sourceId: '11111111-2222-3333-4444-555555555555',
    sourceName: 'Revolut',
    createdAt: Date.now(),
    rows: [],
    manualCandidates: {},
    importedTransactions: [],
    batchId: 'batch-1',
    availableTargets: [],
    statementClosingBalance: closing,
    statementDate: date,
  }) as unknown as ImportReviewPayload;

describe('extractStatementBalance — doslovni Revolut izvadak', () => {
  it('čita završni saldo iz „Sažetka salda" (redak Ukupno)', () => {
    const reading = extractStatementBalance(revolutText);
    expect(reading.closingBalance).toBe(4957.71);
  });

  it('valuta uz iznos je prepoznata', () => {
    expect(extractStatementBalance(revolutText).currency).toBe('EUR');
  });

  it('zaglavlje se čita nad CIJELIM tekstom, ne po blokovima', () => {
    // Segmentacija reže tablicu prometa; zaglavlje ostaje isto.
    const firstBlock = revolutText.split(/\r?\n/).slice(0, 60).join('\n');
    expect(extractStatementBalance(firstBlock).closingBalance).toBe(4957.71);
  });
});

describe('regresija — klasična banka i izvod bez salda', () => {
  it('Erste oblik: „Novo stanje" i dalje prolazi', () => {
    const erste = [
      'ERSTE&STEIERMÄRKISCHE BANK d.d.',
      'Izvod br. 152 po transakcijskom računu',
      'IBAN: HR1723600001101234565',
      'Razdoblje: 01.08.2026. - 31.08.2026.',
      'Prethodno stanje 1.100,00',
      'Novo stanje 244,85',
      '05.08.2026. KONZUM 55,15 1.044,85',
    ].join('\n');
    expect(extractStatementBalance(erste).closingBalance).toBe(244.85);
  });

  it('izvod bez ijednog salda → null (nema nagađanja)', () => {
    const bez = [
      'Banka d.d.',
      'Izvod br. 7',
      'Razdoblje: 01.08.2026. - 31.08.2026.',
      '05.08.2026. KONZUM 55,15',
      '06.08.2026. INA 40,00',
    ].join('\n');
    expect(extractStatementBalance(bez).closingBalance).toBeNull();
  });

  it('prazan tekst ne ruši čitač', () => {
    expect(extractStatementBalance('').closingBalance).toBeNull();
    expect(extractStatementBalance(null).closingBalance).toBeNull();
  });
});

describe('kanal do izvršitelja je isti za oba puta', () => {
  it('pročitani saldo postaje bankovna istina izvora', () => {
    const reading = extractStatementBalance(revolutText);
    const fallback = resolveStatementFallback(payload(reading.closingBalance, reading.periodTo));
    expect(fallback?.closingBalance).toBe(4957.71);
  });

  it('bez salda nema fallbacka → nikakva ponuda poravnanja', () => {
    expect(resolveStatementFallback(payload(null, null))).toBeNull();
  });
});
