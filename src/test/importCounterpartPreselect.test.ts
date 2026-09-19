/**
 * UVOZ IZVODA — PREDODABIR protustrane.
 *
 * Korisnik uvozi Aircash izvod s mnogo GPay nadoplata s Revoluta i ne smije
 * svaku ručno birati: ako opis jednoznačno pokazuje na DRUGI njegov novčanik
 * (kartica ili ime), cilj je predodabran. Dva pogotka ili nijedan → pita se.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preselectTransferCounterpart } from '@/lib/importReview/counterpartPreselect';
import { resolveTransferDirection } from '@/lib/importReview/transferDirection';

const AIRCASH = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const REVOLUT = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const TEKUCI = 'cccccccc-3333-4333-8333-cccccccccccc';
const TEKUCI_Z = 'dddddddd-4444-4444-8444-dddddddddddd';

const wallets = [
  { id: AIRCASH, name: 'Aircash', cards: [] },
  { id: REVOLUT, name: 'Revolut', cards: [{ id: 'card-1542', last_four_digits: '1542' }] },
];

describe('preselectTransferCounterpart', () => {
  it('(a) Aircash izvod: „…Google Pay … Revolut" → cilj Revolut po imenu, smjer iz predznaka', () => {
    const r = preselectTransferCounterpart({
      sourceWalletId: AIRCASH,
      description: 'Uplata na Aircash Google Pay nadoplata Revolut',
      merchantName: null,
      wallets,
    });
    expect(r).toMatchObject({ kind: 'own_transfer', counterpartSourceId: REVOLUT, signal: 'name' });
    expect(resolveTransferDirection({ statementDirection: 'in' }).direction).toBe('in');
  });

  it('(b) Revolut izvod: „aircash.eu … Kartica: 416598******1542" → cilj Aircash (kartica je izvor)', () => {
    const r = preselectTransferCounterpart({
      sourceWalletId: REVOLUT,
      description: 'aircash.eu, Kartica: 416598******1542',
      merchantName: null,
      wallets,
    });
    expect(r).toMatchObject({ kind: 'own_transfer', counterpartSourceId: AIRCASH, signal: 'name' });
  });

  it('(c) dva novčanika pogađaju ime → ambiguous, cilj ostaje prazan', () => {
    const r = preselectTransferCounterpart({
      sourceWalletId: AIRCASH,
      description: 'Prijenos na Tekući zaštićeni',
      merchantName: null,
      wallets: [
        { id: AIRCASH, name: 'Aircash', cards: [] },
        { id: TEKUCI, name: 'Tekući', cards: [] },
        { id: TEKUCI_Z, name: 'Tekući zaštićeni', cards: [] },
      ],
    });
    expect(r.kind).toBe('ambiguous');
  });

  it('(d) nepoznata protustrana → none (klasifikacija ostaje nepromijenjena)', () => {
    const r = preselectTransferCounterpart({
      sourceWalletId: AIRCASH,
      description: 'KONZUM 1234 ZAGREB',
      merchantName: 'Konzum',
      wallets,
    });
    expect(r.kind).toBe('none');
  });

  it('kartica DRUGOG novčanika odlučuje bez imena', () => {
    const r = preselectTransferCounterpart({
      sourceWalletId: AIRCASH,
      description: 'Uplata 416598******1542',
      merchantName: null,
      wallets,
    });
    expect(r).toMatchObject({ kind: 'own_transfer', counterpartSourceId: REVOLUT, signal: 'card' });
  });
});

describe('GlobalPDFImportHost — prednost zapamćenog pravila', () => {
  const SRC = readFileSync(
    resolve(process.cwd(), 'src/components/pdf-import/GlobalPDFImportHost.tsx'),
    'utf8',
  );

  it('(e) pravilo se provjerava PRIJE predodabira po modulu', () => {
    const rule = SRC.indexOf('const override = transferOverrides.get(i);');
    const pre = SRC.indexOf('preselectTransferCounterpart({');
    expect(rule).toBeGreaterThan(0);
    expect(pre).toBeGreaterThan(rule);
  });

  it('predodabir nosi origin counterpart i signal', () => {
    expect(SRC).toContain("origin: preselected ? ('counterpart' as const) : ('keyword' as const)");
    expect(SRC).toContain('counterpartSignal: preselected.signal');
  });
});
