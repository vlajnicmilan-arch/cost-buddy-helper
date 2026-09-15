/**
 * VRIJEDNOST IZ TEKSTA — datum stavke dolazi iz samog dokumenta.
 *
 * Dokaz se vodi nad DOSLOVNIM tekstom izvoda (živi slučaj 15.9. + postojeći
 * fixture-i pravih banaka), ne nad izmišljenim primjerima.
 */
import { describe, it, expect } from 'vitest';
import {
  applyTextValues,
  lineDates,
  parseLineDate,
} from '../../supabase/functions/_shared/statement/valueFromText.ts';
import { splitStatementLines } from '../../supabase/functions/_shared/statement/rawLineMatch.ts';
import { guardStatementDate, normalizePeriod } from '../../supabase/functions/_shared/statement/datePeriodGuard.ts';
import { OTP_CHARGE_CARD_STATEMENT } from './fixtures/otpChargeCardStatement';
import { readFileSync } from 'node:fs';

// Tacturin Erste izvod (privitak 75e17304), razdoblje 14.09.2026.
const ERSTE_TEXT = `Izvod po transakcijskom računu
Za razdoblje (po datumu obrade): 14.09.2026.
Datum obrade Datum valute Opis Iznos
14.09.2026. 14.09.2026. ERSTE&STEIERMARKISCHE BANK d.d. RIJEKA HR95 - Naplata naknade platnog prometa 19,16`;

const REVOLUT_TEXT = readFileSync('src/test/fixtures/revolutStatementFull.txt', 'utf8');

describe('lineDates / parseLineDate', () => {
  it('čita hrvatski, ISO i riječni oblik', () => {
    expect(lineDates('14.09.2026. 14.09.2026. Naknada 19,16')).toEqual(['2026-09-14']);
    expect(lineDates('2026-09-14 nešto')).toEqual(['2026-09-14']);
    expect(parseLineDate('9. kol 2026. Google Play 229,00€')).toBe('2026-08-09');
  });

  it('bira datum iz razdoblja kad ih redak nosi više', () => {
    const period = normalizePeriod('2026-09-01', '2026-09-30')!;
    expect(parseLineDate('01.08.2026. 14.09.2026. Naknada 19,16', period)).toBe('2026-09-14');
  });

  it('dan/mjesec bez godine ne prolazi kao datum', () => {
    expect(lineDates('LIDL/12.02/EUR/44,57')).toEqual([]);
  });
});

describe('(a) živi slučaj — Erste 19,16 od 14.09.2026.', () => {
  it('datum se preuzima iz teksta i nadjačava krivi AI-datum', () => {
    const period = normalizePeriod('2026-09-14', '2026-09-14')!;
    const lines = splitStatementLines(ERSTE_TEXT);
    const [out] = applyTextValues(lines, [{ date: '2026-04-14', amount: 19.16 }], period);

    expect(out.dateSource).toBe('statement_text');
    expect(out.date).toBe('2026-09-14');
    expect(out.amountConfirmed).toBe(true);
    // Brana bi AI-datum zaustavila; pročitani datum prolazi.
    expect(guardStatementDate('2026-04-14', period).kind).toBe('blocked');
    expect(guardStatementDate(out.date, period).kind).toBe('ok');
  });
});

describe('(b) regresija na stvarnim izvodima — točan AI-datum ostaje točan', () => {
  it('Revolut: datumi i iznosi nepromijenjeni', () => {
    const lines = splitStatementLines(REVOLUT_TEXT);
    const txs = [
      { date: '2026-08-09', amount: 229 },      // Google Play
      { date: '2026-08-10', amount: 33.28 },    // Velekem
      { date: '2026-08-10', amount: 39.38 },    // BAUHAUS
      { date: '2026-08-10', amount: 11.96 },    // Pevex
      { date: '2026-08-10', amount: 8.99 },     // SPAR
    ];
    const out = applyTextValues(lines, txs, normalizePeriod('2025-07-02', '2026-08-10'));
    out.forEach((r, i) => {
      if (r.dateSource === 'statement_text') expect(r.date).toBe(txs[i].date);
    });
    // Barem dio redaka mora biti jednoznačno pročitan iz teksta.
    expect(out.some((r) => r.dateSource === 'statement_text')).toBe(true);
  });

  it('OTP charge kartica: nijedan točan datum nije pokvaren', () => {
    const lines = splitStatementLines(OTP_CHARGE_CARD_STATEMENT);
    const txs = [
      { date: '2026-02-13', amount: 44.57 },
      { date: '2026-02-21', amount: 3.39 },
      { date: '2026-02-23', amount: 5.8 },
      { date: '2026-02-09', amount: 12.99 },
    ];
    const out = applyTextValues(lines, txs, normalizePeriod('2026-02-01', '2026-03-01'));
    out.forEach((r, i) => {
      // Preuzima se samo ako je redak jednoznačan; preuzeta vrijednost mora
      // biti jednaka dosadašnjoj (AI je ovdje bio točan).
      if (r.dateSource === 'statement_text') expect(r.date).toBe(txs[i].date);
    });
  });
});

describe('(c) izvod bez tekstualnog sloja', () => {
  it('AI put nepromijenjen', () => {
    const out = applyTextValues([], [{ date: '2026-04-14', amount: 19.16 }], null);
    expect(out).toEqual([
      { date: null, dateSource: 'ai', matchedLine: null, amountConfirmed: false },
    ]);
  });
});

describe('(d) nejednoznačni redci', () => {
  const lines = splitStatementLines(`01.02.2026. Naknada 1,50
05.02.2026. Naknada 1,50`);

  it('dva retka istog iznosa — ne pogađa se, ostaje AI-datum', () => {
    const out = applyTextValues(lines, [{ date: '2026-02-01', amount: 1.5 }], null);
    expect(out[0].dateSource).toBe('ai');
    expect(out[0].date).toBeNull();
    expect(out[0].amountConfirmed).toBe(true);
  });

  it('jednoznačni redak se troši — drugi ga ne može uzeti', () => {
    const two = splitStatementLines(`01.02.2026. Naknada 1,50
05.02.2026. Kamata 2,40`);
    const out = applyTextValues(two, [{ date: 'x', amount: 1.5 }, { date: 'x', amount: 1.5 }], null);
    expect(out[0].date).toBe('2026-02-01');
    expect(out[1].date).toBeNull();
  });

  it('sparivanje NE ovisi o AI-datumu', () => {
    const withDate = applyTextValues(splitStatementLines(ERSTE_TEXT), [{ date: '2026-09-14', amount: 19.16 }], null);
    const withoutDate = applyTextValues(splitStatementLines(ERSTE_TEXT), [{ amount: 19.16 }], null);
    const nonsenseDate = applyTextValues(splitStatementLines(ERSTE_TEXT), [{ date: '1999-01-01', amount: 19.16 }], null);
    expect(withDate[0].date).toBe('2026-09-14');
    expect(withoutDate[0]).toEqual(withDate[0]);
    expect(nonsenseDate[0]).toEqual(withDate[0]);
  });
});
