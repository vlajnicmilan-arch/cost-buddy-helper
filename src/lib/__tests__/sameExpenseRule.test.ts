import { describe, it, expect } from 'vitest';
import { decideSameExpenseAuto, decideSameExpenseAutoBatch, findSameExpenseOffers, SameExpenseOwnerError } from '../sameExpenseRule';
import { resolvePaymentSourceKey } from '../paymentSource/resolve';
import { sameExpenseSourceKey } from '../sameExpenseRule';
import {
  MUST_MATCH, CARD_WALLETS, OTHER, WALLET_2, CARD_OTHER_WALLET, CARD_PHYS_2081, CARD_TOKEN_7246, manual, bank,
} from '@/test/fixtures/sameExpense/realPairs';

describe('auto — obavezni stvarni parovi', () => {
  for (const p of MUST_MATCH) {
    it(`${p.name} → match`, () => {
      const r = decideSameExpenseAuto(p.bank, [p.manual], CARD_WALLETS);
      expect(r.outcome).toBe('match');
      expect(r.candidate?.id).toBe(p.manual.id);
    });
  }
});

describe('auto — ne smije spojiti', () => {
  it('Fero-Term ↔ Ribola 5,95 isti dan', () => {
    const r = decideSameExpenseAuto(bank('b-ribola', 5.95, '2026-08-10', 'RIBOLA 123'), [manual('m-fero', 5.95, '2026-08-10', 'Fero-Term')], CARD_WALLETS);
    expect(r.outcome).not.toBe('match');
  });

  it('račun HAC 17,60 prema dva prolaza isti dan → ambiguous', () => {
    const m = manual('m-hac', 17.6, '2026-08-14', 'Hrvatske autoceste');
    const r = decideSameExpenseAutoBatch([
      bank('b-lucko', 17.6, '2026-08-14', 'Hrvatske autoceste Lučko'),
      bank('b-rovanjska', 17.6, '2026-08-14', 'Hrvatske autoceste Rovanjska'),
    ], [m], CARD_WALLETS);
    expect(r.map((x) => x.outcome)).toEqual(['ambiguous', 'ambiguous']);
  });

  it('dva ručna računa istog iznosa za jedan prolaz → ambiguous', () => {
    const b1 = bank('b-lucko', 17.6, '2026-08-14', 'Hrvatske autoceste Lučko');
    const r = decideSameExpenseAuto(b1, [
      manual('m-1', 17.6, '2026-08-14', 'Hrvatske autoceste'),
      manual('m-2', 17.6, '2026-08-14', 'Hrvatske autoceste'),
    ], CARD_WALLETS);
    expect(r.outcome).toBe('ambiguous');
  });

  it('batch ne mijenja obavezne parove', () => {
    const r = decideSameExpenseAutoBatch(MUST_MATCH.map((p) => p.bank), MUST_MATCH.map((p) => p.manual), CARD_WALLETS);
    expect(r.map((x) => x.candidate?.id)).toEqual(MUST_MATCH.map((p) => p.manual.id));
  });
});

describe('auto — rubovi', () => {
  const base = MUST_MATCH[1];
  it('banka 2 dana prije ručnog → none', () => {
    expect(decideSameExpenseAuto({ ...base.bank, date: '2026-08-01' }, [base.manual]).outcome).toBe('none');
  });
  it('banka 1 dan prije ručnog → match', () => {
    expect(decideSameExpenseAuto({ ...base.bank, date: '2026-08-02' }, [base.manual]).outcome).toBe('match');
  });
  it('banka 4 dana poslije → none', () => {
    expect(decideSameExpenseAuto({ ...base.bank, date: '2026-08-07' }, [base.manual]).outcome).toBe('none');
  });
  it('1 cent razlike → none', () => {
    expect(decideSameExpenseAuto({ ...base.bank, amount: 113.88 }, [base.manual]).outcome).toBe('none');
  });
  it('drugi novčanik → none', () => {
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, paymentSource: WALLET_2 }]).outcome).toBe('none');
  });
  it('tuđi user_id → none', () => {
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, userId: OTHER }]).outcome).toBe('none');
  });
  it('kartica drugog novčanika → none', () => {
    const r = decideSameExpenseAuto({ ...base.bank, cardId: CARD_PHYS_2081 }, [{ ...base.manual, cardId: CARD_OTHER_WALLET }], CARD_WALLETS);
    expect(r.outcome).toBe('none');
  });
  it('nepoznata kartica → uncertain', () => {
    const r = decideSameExpenseAuto({ ...base.bank, cardId: CARD_PHYS_2081 }, [{ ...base.manual, cardId: 'card-x' }], CARD_WALLETS);
    expect(r.outcome).toBe('uncertain');
  });
  it('ručni bez trgovca i opisa → uncertain', () => {
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, merchantName: null }]).outcome).toBe('uncertain');
  });
  it('opis ručnog koristi se samo kad nema trgovca', () => {
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, merchantName: null, description: 'Petrol' }]).outcome).toBe('match');
  });
  it('prijenos, korekcija i avans nikad', () => {
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, type: 'transfer' }]).outcome).toBe('none');
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, expenseNature: 'correction' }]).outcome).toBe('none');
    expect(decideSameExpenseAuto(base.bank, [{ ...base.manual, isAdvance: true }]).outcome).toBe('none');
  });
  it('bez vlasnika baca grešku', () => {
    expect(() => decideSameExpenseAuto({ ...base.bank, userId: '' }, [base.manual])).toThrow(SameExpenseOwnerError);
  });
  it('kartice istog novčanika ne blokiraju', () => {
    const r = decideSameExpenseAuto({ ...base.bank, cardId: CARD_PHYS_2081 }, [{ ...base.manual, cardId: CARD_TOKEN_7246 }], CARD_WALLETS);
    expect(r.outcome).toBe('match');
  });
});

describe('offer', () => {
  it('Oluk vraća jednog kandidata s podacima za prikaz', () => {
    const p = MUST_MATCH[5];
    const r = findSameExpenseOffers(p.manual, [p.bank]);
    expect(r).toHaveLength(1);
    expect(r[0].merchantSimilar).toBe(true);
    expect(r[0].row).toBe(p.bank); // prosljeđeno netaknuto
    expect(r[0].row.bankRawLine).toBeTruthy();
    expect(r[0].row.origin).toEqual({ kind: 'sync', importedAt: '2026-08-12T06:00:00Z' });
  });

  it('dva točenja Petrola istog iznosa unutar 4 dana → oba', () => {
    const m = manual('m-p', 50, '2026-08-10', 'Petrol');
    const r = findSameExpenseOffers(m, [
      bank('b-p2', 50, '2026-08-13', 'PETROL BS 2'),
      bank('b-p1', 50, '2026-08-11', 'PETROL BS 1'),
    ]);
    expect(r.map((o) => o.row.id)).toEqual(['b-p1', 'b-p2']);
  });

  it('sličan trgovac ide prije bližeg datuma', () => {
    const m = manual('m-x', 20, '2026-08-10', 'Konzum');
    const r = findSameExpenseOffers(m, [bank('b-other', 20, '2026-08-10', 'Lidl'), bank('b-konzum', 20, '2026-08-13', 'KONZUM 0123')]);
    expect(r.map((o) => [o.row.id, o.merchantSimilar])).toEqual([['b-konzum', true], ['b-other', false]]);
  });

  it('potvrđen, tuđi, >4 dana i bez bankovnog id-a ispadaju', () => {
    const m = manual('m-y', 20, '2026-08-10', 'Konzum');
    const r = findSameExpenseOffers(m, [
      bank('b1', 20, '2026-08-10', 'Konzum', { bankMatchStatus: 'confirmed' }),
      bank('b2', 20, '2026-08-10', 'Konzum', { userId: OTHER }),
      bank('b3', 20, '2026-08-15', 'Konzum'),
      bank('b4', 20, '2026-08-10', 'Konzum', { bankTransactionId: null }),
    ]);
    expect(r).toEqual([]);
  });
});

describe('ključ izvora', () => {
  it('isti kao resolvePaymentSourceKey', () => {
    for (const v of [null, '', ' cash ', 'custom:CC000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000003']) {
      expect(sameExpenseSourceKey(v)).toBe(resolvePaymentSourceKey(v));
    }
  });
});
