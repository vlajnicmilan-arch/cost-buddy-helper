/**
 * moneyDirection — jedinica smjera novca.
 *
 * Slučajevi su stvarni opisi s Aircash izvoda koji su 7.8. završili s krivim
 * smjerom (5 nadoplata knjiženo kao odljev, saldo −526,96 €).
 */
import { describe, it, expect } from 'vitest';
import {
  classifyTransferDescription,
  detectTransferDirection,
  buildTransferPair,
  resolveBankTxDirection,
} from '../moneyDirection';

const AIRCASH = '0716b12f-6723-4b60-a089-673e8187df0d';
const REVOLUT = '11111111-2222-3333-4444-555555555555';

describe('classifyTransferDescription', () => {
  it('Uplata na Aircash Google Pay → prijenos, smjer IN', () => {
    const r = classifyTransferDescription('Uplata na Aircash Google Pay');
    expect(r.isTransfer).toBe(true);
    expect(r.direction).toBe('in');
  });

  it('Uplata gotovine na Aircash Ina → prijenos, smjer IN', () => {
    const r = classifyTransferDescription('Uplata gotovine na Aircash Ina');
    expect(r.isTransfer).toBe(true);
    expect(r.direction).toBe('in');
  });

  it('Aircash Pay Jadrolinija → obična kupnja, nije prijenos', () => {
    const r = classifyTransferDescription('Aircash Pay Jadrolinija');
    expect(r.isTransfer).toBe(false);
    expect(r.direction).toBeNull();
  });

  it('podizanje gotovine na bankomatu → prijenos, smjer OUT', () => {
    const r = classifyTransferDescription('Podizanje gotovine bankomat PBZ');
    expect(r.isTransfer).toBe(true);
    expect(r.direction).toBe('out');
  });

  it('nejasan prijenos vraća null smjer (pitanje korisniku)', () => {
    const r = classifyTransferDescription('Interni prijenos 12345');
    expect(r.isTransfer).toBe(true);
    expect(r.direction).toBeNull();
    expect(r.confidence).toBe('low');
  });

  it('prazan opis nije prijenos', () => {
    expect(detectTransferDirection('')).toBeNull();
    expect(classifyTransferDescription(null).isTransfer).toBe(false);
  });
});

describe('buildTransferPair', () => {
  it('IN: druga strana plaća, novčanik izvoda prima', () => {
    const pair = buildTransferPair({
      statementSource: `custom:${AIRCASH}`,
      counterpartSourceId: REVOLUT,
      direction: 'in',
    });
    expect(pair).toEqual({ paymentSource: `custom:${REVOLUT}`, incomeSourceId: AIRCASH });
  });

  it('OUT: novčanik izvoda plaća, druga strana prima', () => {
    const pair = buildTransferPair({
      statementSource: `custom:${AIRCASH}`,
      counterpartSourceId: REVOLUT,
      direction: 'out',
    });
    expect(pair).toEqual({ paymentSource: `custom:${AIRCASH}`, incomeSourceId: REVOLUT });
  });

  it('odbija prijenos sam sebi', () => {
    expect(buildTransferPair({
      statementSource: `custom:${AIRCASH}`,
      counterpartSourceId: AIRCASH,
      direction: 'out',
    })).toBeNull();
  });

  it('IN na ne-custom izvor (gotovina) nije moguće složiti', () => {
    expect(buildTransferPair({
      statementSource: 'cash',
      counterpartSourceId: REVOLUT,
      direction: 'in',
    })).toBeNull();
  });
});

describe('resolveBankTxDirection', () => {
  it('CRDT → in, visoka pouzdanost', () => {
    expect(resolveBankTxDirection({ creditDebitIndicator: 'CRDT', amount: '10.00' }))
      .toMatchObject({ direction: 'in', confidence: 'high' });
  });

  it('DBIT → out', () => {
    expect(resolveBankTxDirection({ creditDebitIndicator: 'DBIT', amount: '10.00' }))
      .toMatchObject({ direction: 'out', confidence: 'high' });
  });

  it('CRDT uz negativan iznos → predznak pobjeđuje, pouzdanost low', () => {
    const r = resolveBankTxDirection({ creditDebitIndicator: 'CRDT', amount: -19.25 });
    expect(r.direction).toBe('out');
    expect(r.confidence).toBe('low');
    expect(r.reason).toBe('indicator_conflicts_with_amount_sign');
  });

  it('bez indikatora koristi predznak iznosa', () => {
    expect(resolveBankTxDirection({ amount: -5 })).toMatchObject({ direction: 'out', confidence: 'medium' });
  });

  it('bez indikatora i predznaka koristi creditor/debtor', () => {
    expect(resolveBankTxDirection({ amount: 5, debtorName: 'Poslodavac d.o.o.' }))
      .toMatchObject({ direction: 'in', confidence: 'low' });
    expect(resolveBankTxDirection({ amount: 5, creditorName: 'Konzum' }))
      .toMatchObject({ direction: 'out', confidence: 'low' });
  });
});
