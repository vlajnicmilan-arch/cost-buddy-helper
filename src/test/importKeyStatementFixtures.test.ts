/**
 * BRANA KORAKA 1 — identitet retka ne smije ovisiti o tekstu koji AI pročita.
 *
 * Probne datoteke su anonimizirani izvodi (`e2e/fixtures/statements/`):
 *  - erste-no-balance.txt      — stvarni izvod bez stupca salda (ord: put)
 *  - keks-identical-rows.txt   — dva NERAZLUČIVA retka istog dana (sintetski)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  splitStatementLines,
  matchRawLineEntries,
} from '../../supabase/functions/_shared/statement/rawLineMatch.ts';
import { computeImportKeys, type ImportKeyRow } from '@/lib/importFingerprint';
import { planFingerprintRekey } from '@/lib/importReview/fingerprintRekey';

const USER = '00000000-0000-4000-8000-000000000001';
const SOURCE = 'custom:11111111-1111-4111-8111-111111111111';

function fixture(name: string): string[] {
  const text = readFileSync(resolve(process.cwd(), 'e2e/fixtures/statements', name), 'utf8');
  return splitStatementLines(text);
}

/** Čitač: transakcije + pozicija doslovnog retka u izvornom tekstu. */
function readStatement(
  lines: string[],
  txs: Array<{ date: string; amount: number; description: string }>,
): ImportKeyRow[] {
  const matches = matchRawLineEntries(lines, txs.map(t => ({ date: t.date, amount: t.amount })));
  return txs.map((t, i) => ({
    userId: USER,
    paymentSource: SOURCE,
    date: t.date,
    type: 'expense',
    amount: t.amount,
    balanceAfter: null,
    sourceOrder: matches[i] ? matches[i]!.index : null,
  }));
}

const ERSTE_TXS = [9.93, 10.69, 43.03, 0.12, 167.65, 52.17, 97.34, 9.39, 13.66, 26.41]
  .map((amount, i) => ({ date: '2026-09-21', amount, description: `Nalog ${i + 1}` }));

describe('brana koraka 1 — ključ uvoza po probnim izvodima', () => {
  it('(a) isti izvod pročitan dvaput daje ISTE ključeve (nula novih redaka)', async () => {
    const lines = fixture('erste-no-balance.txt');
    const first = await computeImportKeys(readStatement(lines, ERSTE_TXS));
    // Drugo čitanje: AI drukčije napiše opise — ključ to ne smije osjetiti.
    const reworded = ERSTE_TXS.map(t => ({ ...t, description: `${t.description} (PayPal *neki drugi tekst)` }));
    const second = await computeImportKeys(readStatement(lines, reworded));

    expect(first.every(k => typeof k === 'string')).toBe(true);
    expect(second).toEqual(first);

    // Drugi prolaz: svi ključevi već postoje → nijedan novi redak.
    const plan = planFingerprintRekey({
      keysV2: second,
      legacyKeys: second.map((_, i) => `imp:legacy-${i}`),
      live: new Set(first as string[]),
      deleted: new Set(),
    });
    expect(plan.pairs).toEqual([]);
    const novi = plan.fingerprints.filter(fp => !plan.live.has(fp));
    expect(novi).toEqual([]);
  });

  it('(b) redci koji u knjigama postoje pod STARIM ključem se rekeyaju, ne dupliciraju', async () => {
    const lines = fixture('erste-no-balance.txt');
    const keys = await computeImportKeys(readStatement(lines, ERSTE_TXS));
    const legacy = keys.map((_, i) => `imp:staro-${i}`);

    const plan = planFingerprintRekey({
      keysV2: keys,
      legacyKeys: legacy,
      live: new Set(legacy),
      deleted: new Set(),
    });

    expect(plan.pairs).toHaveLength(keys.length);
    expect(plan.fingerprints).toEqual(keys);
    // Svi su nakon rekeya „već u knjigama" → nula novih redaka.
    expect(plan.fingerprints.filter(fp => !plan.live.has(fp))).toEqual([]);
  });

  it('(c) redak bez salda pročitan u drugom redoslijedu daje isti ključ', async () => {
    const lines = fixture('keks-identical-rows.txt');
    const txs = [
      { date: '2026-09-02', amount: 12, description: 'Kava kod Ane' },
      { date: '2026-09-02', amount: 12, description: 'Kava kod Ane' },
      { date: '2026-09-03', amount: 4.5, description: 'Trafika' },
    ];
    const inOrder = await computeImportKeys(readStatement(lines, txs));
    // Čitač vrati iste retke obrnutim redoslijedom.
    const reversedInput = readStatement(lines, [...txs].reverse());
    const reversed = await computeImportKeys(reversedInput);

    expect(inOrder.every(k => typeof k === 'string')).toBe(true);
    expect([...reversed].sort()).toEqual([...inOrder].sort());
  });

  it('(d) soft-obrisan redak sa starim ključem i dalje se prepoznaje kao ranije obrisan', async () => {
    const lines = fixture('erste-no-balance.txt');
    const keys = await computeImportKeys(readStatement(lines, ERSTE_TXS));
    const legacy = keys.map((_, i) => `imp:obrisano-${i}`);

    const plan = planFingerprintRekey({
      keysV2: keys,
      legacyKeys: legacy,
      live: new Set(),
      deleted: new Set(legacy),
    });

    expect(plan.pairs).toHaveLength(keys.length);
    expect(plan.fingerprints.every(fp => plan.deleted.has(fp))).toBe(true);
    expect(plan.fingerprints.some(fp => plan.live.has(fp))).toBe(false);
  });

  it('bez dokazivog redoslijeda nerazlučivi redci NEMAJU v2 ključ (ostaju na starom)', async () => {
    const keys = await computeImportKeys([
      { userId: USER, paymentSource: SOURCE, date: '2026-09-02', amount: 12, balanceAfter: null, sourceOrder: null },
      { userId: USER, paymentSource: SOURCE, date: '2026-09-02', amount: 12, balanceAfter: null, sourceOrder: null },
      { userId: USER, paymentSource: SOURCE, date: '2026-09-03', amount: 4.5, balanceAfter: null, sourceOrder: null },
    ]);
    expect(keys[0]).toBeNull();
    expect(keys[1]).toBeNull();
    expect(typeof keys[2]).toBe('string');
  });
});
