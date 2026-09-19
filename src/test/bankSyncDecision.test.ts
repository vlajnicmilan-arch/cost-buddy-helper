/**
 * REGRESIJA — incident 17.–18.9.2026.
 *
 * Dvije REZERVACIJE istog prijenosa od 300 € („Revolut**5385* Dublin", CRDT,
 * kratki ID `G…R…D`) upisane su kao dva priljeva. Ovi testovi drže pravilo:
 * rezervacija ne ulazi, proknjižena verzija ulazi jednom, a broj kartice
 * određuje platioca.
 */
import { describe, it, expect } from 'vitest';
import {
  decideBankSyncRow,
  isReservation,
  looksLikeShortReservationId,
  pickMergeTarget,
  pickBankBalance,
  normalizeCounterparty,
  type EBTransactionLike,
} from '../../supabase/functions/_shared/bankSyncDecision';
import { extractCardMasks, matchUserCard, type UserCardRef } from '@/lib/cardMatch';

const SRC_TZ = 'src-tz';
const SRC_REVOLUT = 'src-revolut';

const cards: UserCardRef[] = [
  { id: 'card-tz', last_four_digits: '2081', payment_source_id: SRC_TZ },
  { id: 'card-revolut', last_four_digits: '1542', payment_source_id: SRC_REVOLUT },
];

const ctx = { syncPaymentSourceId: SRC_TZ, cards };

const reservation = (id: string, date: string): EBTransactionLike => ({
  entry_reference: id,
  transaction_amount: { amount: '300.00', currency: 'EUR' },
  credit_debit_indicator: 'CRDT',
  status: 'PDNG',
  value_date: date,
  creditor: { name: 'Revolut**5385* Dublin' },
});

describe('(a) rezervacije se ne upisuju', () => {
  it('dvije rezervacije 300 € → 0 upisa, 2 zapisa za dijagnostiku', () => {
    const rows = [
      reservation('G1204340R918423D', '2026-09-17'),
      reservation('G201R005360616D', '2026-09-18'),
    ];
    const decisions = rows.map((tx) => decideBankSyncRow(tx, ctx));
    expect(decisions.every((d) => d.action === 'skip')).toBe(true);
    expect(decisions.every((d) => d.reason === 'reservation')).toBe(true);
    expect(decisions.every((d) => d.isReservation)).toBe(true);
    // Sirovi zapis postoji za oba — to je ono što ide u dijagnostiku.
    expect(decisions.filter((d) => d.raw && d.stableId).length).toBe(2);
    // Indikator rezervacije se ne koristi ni za što.
    expect(decisions.every((d) => d.type === null)).toBe(true);
  });

  it('prazan booking_date je rezervacija, BOOK nije', () => {
    expect(isReservation({ value_date: '2026-09-17' })).toBe(true);
    expect(isReservation({ status: 'BOOK', value_date: '2026-09-17' })).toBe(false);
    expect(isReservation({ booking_date: '2026-09-20' })).toBe(false);
  });

  it('kratki ID je samo signal, ne pravilo', () => {
    expect(looksLikeShortReservationId('G1204340R918423D')).toBe(true);
    expect(looksLikeShortReservationId('18817328211G006R76192105D26')).toBe(false);
  });
});

describe('(b) proknjižena verzija', () => {
  const booked: EBTransactionLike = {
    entry_reference: '18817328211G006R76192105D26',
    transaction_amount: { amount: '300.00', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: '2026-09-20',
    creditor: { name: 'Revolut**5385* Dublin' },
  };

  it('ulazi točno jednom i to kao odljev, ne priljev', () => {
    const d = decideBankSyncRow(booked, ctx);
    expect(d.action).toBe('upsert');
    expect(d.type).toBe('expense');
    expect(d.amount).toBe(300);
    expect((d.raw.decision as Record<string, unknown>).direction).toBe('out');
  });

  it('spaja se s već upisanim retkom istog iznosa 3 dana ranije', () => {
    const existing = [
      { id: 'e1', amount: 300, date: '2026-09-17', description: 'Revolut**5385* Dublin' },
      { id: 'e2', amount: 45, date: '2026-09-19', description: 'Konzum' },
    ];
    const hit = pickMergeTarget(existing, {
      amount: 300,
      date: '2026-09-20',
      description: 'Revolut**5385* Dublin',
    });
    expect(hit?.id).toBe('e1');
  });

  it('dva jednako dobra kandidata → bez spajanja', () => {
    const existing = [
      { id: 'e1', amount: 300, date: '2026-09-17', description: 'Revolut**5385* Dublin' },
      { id: 'e2', amount: 300, date: '2026-09-18', description: 'Revolut**5385* Dublin' },
    ];
    expect(
      pickMergeTarget(existing, { amount: 300, date: '2026-09-20', description: 'Revolut**5385* Dublin' }),
    ).toBeNull();
  });
});

describe('(c) maska kartice', () => {
  const m = (t: string) => matchUserCard(extractCardMasks(t), cards);

  it('462765XXXXXX2081 → TZ Fizička', () => {
    expect(m('KUPNJA 462765XXXXXX2081 KONZUM')?.cardId).toBe('card-tz');
  });

  it('416598******1542 i „Kartica: …1542" → Revolut kartica', () => {
    expect(m('PLAĆANJE 416598******1542')?.cardId).toBe('card-revolut');
    expect(m('Kartica: …1542 Revolut')?.cardId).toBe('card-revolut');
  });

  it('„Visa *1234" i „**5385*" hvata zadnje 4', () => {
    expect(extractCardMasks('Visa *1234').map((x) => x.last4)).toContain('1234');
    expect(extractCardMasks('Revolut**5385* Dublin').map((x) => x.last4)).toContain('5385');
  });

  it('nepoznat broj → null, dva pogotka → null', () => {
    expect(m('Kartica: …9999')).toBeNull();
    expect(m('462765XXXXXX2081 / 416598******1542')).toBeNull();
  });

  it('BIN se pamti kad ga maska nosi', () => {
    expect(extractCardMasks('462765XXXXXX2081')[0].bin).toBe('462765');
  });
});

describe('(e) kartica pripada drugom novčaniku', () => {
  it('redak se ne upisuje, nego traži potvrdu', () => {
    const tx: EBTransactionLike = {
      entry_reference: 'BOOKED-X',
      transaction_amount: { amount: '50.00', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-09-20',
      creditor: { name: 'AIRCASH 416598******1542' },
    };
    const d = decideBankSyncRow(tx, ctx);
    expect(d.action).toBe('skip');
    expect(d.reason).toBe('card_source_mismatch');
    expect(d.transferCandidate?.counterpartSourceId).toBe(SRC_REVOLUT);
    const decision = d.raw.decision as Record<string, unknown>;
    expect(decision.needs_confirmation).toBe(true);
    expect(decision.sync_payment_source_id).toBe(SRC_TZ);
  });

  it('kartica ovog novčanika → upisuje se i nosi payment_source_card_id', () => {
    const tx: EBTransactionLike = {
      entry_reference: 'BOOKED-Y',
      transaction_amount: { amount: '20.00', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-09-20',
      creditor: { name: 'KONZUM 462765XXXXXX2081' },
    };
    const d = decideBankSyncRow(tx, ctx);
    expect(d.action).toBe('upsert');
    expect(d.paymentSourceCardId).toBe('card-tz');
  });
});

describe('(1) sirovi zapis', () => {
  it('nosi cijeli EB objekt i odluku aplikacije', () => {
    const tx: EBTransactionLike = {
      entry_reference: 'RAW-1',
      transaction_amount: { amount: '12.34', currency: 'EUR' },
      credit_debit_indicator: 'DBIT',
      status: 'BOOK',
      booking_date: '2026-09-20',
      creditor: { name: 'Konzum' },
      bank_specific_extra: { foo: 'bar' },
    };
    const d = decideBankSyncRow(tx, ctx);
    expect(d.raw.provider).toBe('enable_banking');
    expect((d.raw.transaction as Record<string, unknown>).bank_specific_extra).toEqual({ foo: 'bar' });
    const decision = d.raw.decision as Record<string, unknown>;
    expect(decision.direction).toBe('out');
    expect(decision.confidence).toBe('high');
    expect(decision.direction_reason).toBe('credit_debit_indicator');
    expect(decision.is_reservation ?? d.isReservation).toBe(false);
  });
});

describe('(f) bankin saldo je istina', () => {
  it('CLBD ima prednost pred ITAV', () => {
    const picked = pickBankBalance([
      { balance_type: 'ITAV', balance_amount: { amount: '1400.00', currency: 'EUR' }, reference_date: '2026-09-19' },
      { balance_type: 'CLBD', balance_amount: { amount: '1357.93', currency: 'EUR' }, reference_date: '2026-09-19' },
    ]);
    expect(picked?.amount).toBe(1357.93);
    expect(picked?.balanceType).toBe('CLBD');
  });

  it('bez proknjiženog uzima raspoloživi', () => {
    expect(
      pickBankBalance([{ name: 'interimAvailable', balance_amount: { amount: '57.34' } }])?.amount,
    ).toBe(57.34);
  });

  it('prazan ili neupotrebljiv odgovor → null (sidro se ne mijenja)', () => {
    expect(pickBankBalance([])).toBeNull();
    expect(pickBankBalance(null)).toBeNull();
    expect(pickBankBalance([{ balance_type: 'CLBD', balance_amount: { amount: 'x' } }])).toBeNull();
  });
});

describe('(g) normalizacija imena protustrane', () => {
  it('maska kartice i grad ne razlikuju istu protustranu', () => {
    expect(normalizeCounterparty('Revolut**5385* Dublin')).toBe('revolut5385');
    expect(normalizeCounterparty('Revolut**5385* - 462765XXXXXX2081,')).toBe('revolut5385');
  });

  it('interpunkcija i velika slova se brišu', () => {
    expect(normalizeCounterparty('TACTURA j.d.o.o.')).toBe('tacturajdoo');
  });
});

describe('(h) spajanje proknjiženog s ručnim prijenosom', () => {
  it('„Revolut**5385* Dublin" (transfer, bez kartice, bez bankovnog ID-a) se spaja', () => {
    const hit = pickMergeTarget(
      [
        {
          id: 'transfer-1',
          amount: 300,
          date: '2026-09-17',
          description: 'Revolut**5385* Dublin',
          type: 'transfer',
          bank_transaction_id: null,
          payment_source_card_id: null,
        },
      ],
      {
        amount: 300,
        date: '2026-09-18',
        cardId: 'card-tz',
        counterparty: 'Revolut**5385* - 462765XXXXXX2081,',
      },
    );
    expect(hit?.id).toBe('transfer-1');
    expect(hit?.type).toBe('transfer');
  });

  it('dvije legitimne uplate TACTURA 420 s vlastitim bankovnim ID-ima se NE spajaju', () => {
    const hit = pickMergeTarget(
      [
        {
          id: 'tac-17',
          amount: 420,
          date: '2026-09-17',
          description: 'TACTURA j.d.o.o.',
          bank_transaction_id: 'BOOKED-17',
          bank_match_status: 'confirmed',
        },
      ],
      { amount: 420, date: '2026-09-18', counterparty: 'TACTURA j.d.o.o.' },
    );
    expect(hit).toBeNull();
  });
});
