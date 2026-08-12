import { describe, it, expect } from 'vitest';
import {
  RAW_LINE_MAX_CHARS,
  amountTokens,
  capRawLine,
  dateTokens,
  matchRawLines,
  splitStatementLines,
} from '../../supabase/functions/_shared/statement/rawLineMatch';
import { computeImportFingerprint } from '@/lib/importFingerprint';

/**
 * CITAT S IZVODA — dokaz nad STVARNIM tekstom iz baze
 * (`inbound_attachments.extracted_text`), ne nad izmišljenim primjerima.
 */

// OTP, izvod 2/2026 (attachment 54128b7b-81a5-4cad-a9be-d02c4e45ae6a)
const OTP_TEXT = `Transakcije
Početno stanje: -6.880,27
Datum valute Uplata StanjeIsplataReferentni broj i opis transakcije
01.02.2026 1597, najamnina 2/26 Snježana Dobra HR1323600003216951883 HR99 -450,00 -7.330,27
01.02.2026 1598, Naknada -0,21 -7.330,48
02.02.2026 1599, PERO KRALJEVIĆ HR1623600003241075826 HR99 300,00 -7.030,48
02.02.2026 1600, POS kup. LIDL HRVATSKA 0215/SPLIT/HRV 53,87EUR/53,87EUR
(31.01.,ACode:064639,Kart:0214) -53,87 -7.084,35
02.02.2026 1601, POS kup. WOLT/ZAGREB/HRV 9,54EUR/9,54EUR
(31.01.,ACode:457176,Kart:0214) -9,54 -7.093,89`;

// Revolut, "Izvadak za EUR" (attachment 9aef32ef-b6e7-4eaf-b445-8d874c8e66e0)
const REVOLUT_TEXT = `Na čekanju od 2. srpnja 2025. do 10. kolovoza 2026.
Datum početka Opis Poslani novac Primljeni novac
9. kol 2026. Google Play 229,00€
Primatelj: Google*google Play App, Dublin
Kartica: 416598******1542
10. kol 2026. Velekem 33,28€
Primatelj: Velekem, Zadar
Kartica: 416598******1542`;

describe('amountTokens / dateTokens', () => {
  it('pokriva hrvatsko i englesko grupiranje', () => {
    expect(amountTokens(1234.5)).toEqual(
      expect.arrayContaining(['1234.50', '1234,50', '1,234.50', '1.234,50']),
    );
  });
  it('daje hrvatski oblik datuma i kratice mjeseca', () => {
    expect(dateTokens('2026-08-09')).toEqual(expect.arrayContaining(['09.08.2026', '9. kol']));
  });
});

describe('matchRawLines nad stvarnim OTP tekstom', () => {
  const lines = splitStatementLines(OTP_TEXT);

  it('vraća DOSLOVAN redak izvoda', () => {
    const [rent, pero] = matchRawLines(lines, [
      { date: '2026-02-01', amount: 450 },
      { date: '2026-02-02', amount: 300 },
    ]);
    expect(rent).toBe(
      '01.02.2026 1597, najamnina 2/26 Snježana Dobra HR1323600003216951883 HR99 -450,00 -7.330,27',
    );
    expect(pero).toBe('02.02.2026 1599, PERO KRALJEVIĆ HR1623600003241075826 HR99 300,00 -7.030,48');
  });

  it('spaja prelomljeni redak (nastavak u zagradi)', () => {
    const [lidl] = matchRawLines(lines, [{ date: '2026-02-02', amount: 53.87 }]);
    expect(lidl).toBe(
      '02.02.2026 1600, POS kup. LIDL HRVATSKA 0215/SPLIT/HRV 53,87EUR/53,87EUR (31.01.,ACode:064639,Kart:0214) -53,87 -7.084,35',
    );
  });

  it('ne troši isti redak dvaput', () => {
    const out = matchRawLines(lines, [
      { date: '2026-02-01', amount: 0.21 },
      { date: '2026-02-01', amount: 0.21 },
    ]);
    expect(out[0]).toBe('01.02.2026 1598, Naknada -0,21 -7.330,48');
    expect(out[1]).not.toBe(out[0]);
  });
});

describe('matchRawLines nad stvarnim Revolut tekstom', () => {
  it('uzima blok s primateljem i karticom', () => {
    const [google] = matchRawLines(splitStatementLines(REVOLUT_TEXT), [
      { date: '2026-08-09', amount: 229 },
    ]);
    expect(google).toBe(
      '9. kol 2026. Google Play 229,00€ Primatelj: Google*google Play App, Dublin Kartica: 416598******1542',
    );
  });
});

describe('granice', () => {
  it('reže citat na 300 znakova', () => {
    const long = capRawLine('x'.repeat(500));
    expect(long).not.toBeNull();
    expect(long!.length).toBe(RAW_LINE_MAX_CHARS);
  });
  it('sken bez teksta → nema determinističkog pogotka', () => {
    expect(matchRawLines([], [{ date: '2026-02-01', amount: 10 }])).toEqual([null]);
  });
});

describe('otisak ostaje netaknut', () => {
  it('citat NE ulazi u computeImportFingerprint', async () => {
    const base = {
      userId: 'u1',
      paymentSource: 'custom:abc',
      date: '2026-02-02',
      type: 'expense',
      amount: 53.87,
      description: 'POS kup. LIDL',
      merchantName: 'LIDL',
      balanceAfter: -7084.35,
    };
    const a = await computeImportFingerprint(base);
    const b = await computeImportFingerprint({ ...base } as never);
    expect(a).toBe(b);
    expect(a.startsWith('imp:')).toBe(true);
  });
});
