import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectPendingRanges,
  markPendingTransactions,
} from '../../supabase/functions/_shared/statement/pendingSection';
import { splitStatementLines } from '../../supabase/functions/_shared/statement/rawLineMatch';

/**
 * DOKAZ nad doslovnim tekstom izvoda (inbound_attachments
 * 0be5624f-a38c-44fe-867a-e23194ddff61): blok „Na čekanju" ne ulazi u knjige.
 */
const REVOLUT = readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/revolutPendingBlock.txt'),
  'utf8',
);
const LINES = splitStatementLines(REVOLUT);

/** Redci koje bi čitač emitirao: rezervacije (bez salda) + proknjiženo (sa saldom). */
function txsFromFixture() {
  const out: Array<{ date: string; amount: number; balance_after: number | null; label: string }> = [];
  const monthIdx = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
  const rowRe = /^(\d{1,2})\.\s*([a-zžšćčđ]+)\s*(\d{4})\.\s+(.+?)\s+([\d.]+,\d{2})€(?:\s+([\d.]+,\d{2})€)?$/i;
  for (const line of LINES) {
    const m = line.match(rowRe);
    if (!m) continue;
    const mi = monthIdx.indexOf(m[2].toLowerCase());
    if (mi < 0) continue;
    const date = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    out.push({
      date,
      amount: num(m[5]),
      balance_after: m[6] ? num(m[6]) : null,
      label: `${date} ${m[4]} ${m[5]}`,
    });
  }
  return out;
}

describe('blok rezervacija na stvarnom Revolut izvodu', () => {
  it('prepoznaje točno jedan blok „Na čekanju"', () => {
    const ranges = detectPendingRanges(LINES);
    expect(ranges).toHaveLength(1);
    expect(LINES[ranges[0].start]).toContain('Na čekanju');
    expect(LINES[ranges[0].end + 1]).toContain('Transakcije po računu');
  });

  // 104 = svi redci s datumom u proknjiženom dijelu (bez zasebnih „Naknada"
  // podredaka koje čitač emitira kao vlastite stavke).
  it('plan uvoza nosi sve proknjižene retke i nijednu rezervaciju', () => {
    const txs = txsFromFixture();
    const pending = markPendingTransactions(LINES, txs);
    const planned = txs.filter((_, i) => !pending[i]);
    expect(pending.filter(Boolean)).toHaveLength(4);
    expect(planned).toHaveLength(104);
    // Jedini proknjiženi redak bez salda (Google Play 229,00) ostaje u planu —
    // rezervacija se prepoznaje po BLOKU, ne po pukom izostanku salda.
    expect(planned.filter((t) => t.balance_after === null)).toHaveLength(1);
  });

  it('Facebook 15,00 od 18.08. u planu je točno jednom', () => {
    const txs = txsFromFixture();
    const pending = markPendingTransactions(LINES, txs);
    const fb = txs.filter(
      (t, i) => !pending[i] && t.amount === 15 && t.date === '2026-08-18' && /Facebook/i.test(t.label),
    );
    expect(fb).toHaveLength(1);
  });
});

describe('brane protiv gašenja uvoza', () => {
  it('izvod bez ijednog salda (KEKS) ostaje netaknut', () => {
    const lines = splitStatementLines(
      [
        'Na čekanju',
        'Datum Opis Iznos',
        '01.08.2026 Kava 3,50',
        'Promet',
        'Datum Opis Iznos',
        '02.08.2026 Kruh 2,00',
      ].join('\n'),
    );
    const txs = [
      { date: '2026-08-01', amount: 3.5, balance_after: null },
      { date: '2026-08-02', amount: 2, balance_after: null },
    ];
    expect(markPendingTransactions(lines, txs)).toEqual([false, false]);
  });

  it('izvod bez bloka rezervacija ne označava ništa', () => {
    const lines = splitStatementLines(
      ['Promet po računu', 'Datum Opis Iznos Saldo', '02.08.2026 Kruh 2,00 98,00'].join('\n'),
    );
    expect(markPendingTransactions(lines, [{ date: '2026-08-02', amount: 2, balance_after: 98 }])).toEqual([
      false,
    ]);
  });

  it('naslov s tablicom KOJA IMA saldo nije blok rezervacija', () => {
    const lines = splitStatementLines(
      ['Na čekanju', 'Datum Opis Iznos Saldo', '01.08.2026 Kava 3,50 96,50'].join('\n'),
    );
    expect(detectPendingRanges(lines)).toHaveLength(0);
  });
});
