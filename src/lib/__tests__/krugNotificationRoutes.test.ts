/**
 * Čuvar: svaki `krug_*` tip koji server (`notify-krug-event`) može emitirati
 * MORA imati eksplicitno odredište u `KRUG_NOTIFICATION_DESTINATIONS`.
 * Novi tip bez unosa → ovaj test pada.
 *
 * Plus: navigacijski testovi za tri reprezentativna tipa (expense, settlement,
 * override) i fallback slučaj kad ciljani id nedostaje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KRUG_NOTIFICATION_DESTINATIONS,
  KRUG_NOTIFICATION_TYPES,
  resolveKrugNotification,
  extractSettlementId,
} from '@/lib/krugNotificationRoutes';
import { normalizePayload } from '@/lib/notificationPayload';

const KRUG_ID = '11111111-1111-1111-1111-111111111111';
const EXPENSE_ID = '22222222-2222-2222-2222-222222222222';
const LEDGER_ID = '33333333-3333-3333-3333-333333333333';

/** Tipovi koji se pojavljuju u serverskoj funkciji, ali nisu obavijesti. */
const NON_NOTIFICATION = new Set([
  'krug_id',
  'krug_membership',
  'krug_ownership',
  'krug_notify_internal_key',
]);

describe('krug notification destination table', () => {
  it('pokriva svaki krug_* tip iz notify-krug-event', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/notify-krug-event/index.ts'),
      'utf8',
    );
    const found = new Set(
      (src.match(/krug_[a-z_]+/g) ?? []).filter((t) => !NON_NOTIFICATION.has(t)),
    );
    const missing = [...found].filter(
      (t) => !Object.prototype.hasOwnProperty.call(KRUG_NOTIFICATION_DESTINATIONS, t),
    );
    expect(missing).toEqual([]);
  });

  it('svaki tip ima jedno od 4 poznata odredišta', () => {
    for (const type of KRUG_NOTIFICATION_TYPES) {
      expect(['expense', 'settlement', 'krug', 'list']).toContain(
        KRUG_NOTIFICATION_DESTINATIONS[type],
      );
    }
  });

  it('nijedan tip ne završi na generičnom popisu ako krug_id postoji', () => {
    for (const type of KRUG_NOTIFICATION_TYPES) {
      if (KRUG_NOTIFICATION_DESTINATIONS[type] === 'list') continue;
      const r = resolveKrugNotification(type, { krug_id: KRUG_ID });
      expect(r?.route.startsWith(`/krug?id=${KRUG_ID}`)).toBe(true);
    }
  });
});

describe('krug notification navigation', () => {
  it('expense: odluka o trošku vodi na tu transakciju', () => {
    const p = normalizePayload('krug_expense_rejected', {
      krug_id: KRUG_ID,
      expense_id: EXPENSE_ID,
      route: '/krug',
    });
    expect(p.route).toBe(`/krug?id=${KRUG_ID}&expense=${EXPENSE_ID}`);
    expect(p.highlight).toEqual({ type: 'expense', id: EXPENSE_ID });
    expect(p.fallback_route).toBe(`/krug?id=${KRUG_ID}`);
  });

  it('override: prijedlog podjele vodi na istu transakciju', () => {
    const p = normalizePayload('krug_override_proposed', {
      krug_id: KRUG_ID,
      expense_id: EXPENSE_ID,
    });
    expect(p.route).toBe(`/krug?id=${KRUG_ID}&expense=${EXPENSE_ID}`);
    expect(p.highlight).toEqual({ type: 'expense', id: EXPENSE_ID });
  });

  it('settlement: ledger id se čita iz dedup_ref', () => {
    expect(extractSettlementId({ dedup_ref: `voided:${LEDGER_ID}` })).toBe(LEDGER_ID);
    const p = normalizePayload('krug_settlement_voided', {
      krug_id: KRUG_ID,
      dedup_ref: `voided:${LEDGER_ID}`,
    });
    expect(p.route).toBe(`/krug?id=${KRUG_ID}&settlement=${LEDGER_ID}`);
    expect(p.highlight).toEqual({ type: 'settlement', id: LEDGER_ID });
  });

  it('fallback: nedostaje expense_id → ekran Kruga, bez greške', () => {
    const p = normalizePayload('krug_expense_confirmed', { krug_id: KRUG_ID });
    expect(p.route).toBe(`/krug?id=${KRUG_ID}`);
    expect(p.highlight).toEqual({ type: 'krug', id: KRUG_ID });
  });

  it('fallback: obrisan Krug → popis krugova', () => {
    const p = normalizePayload('krug_deleted', { krug_id: KRUG_ID });
    expect(p.route).toBe('/krug');
    expect(p.highlight).toBeNull();
  });

  it('poštuje ručno postavljenu (ne-generičnu) rutu', () => {
    const p = normalizePayload('krug_expense_proposed', {
      route: '/krug?custom=1',
      krug_id: KRUG_ID,
      expense_id: EXPENSE_ID,
    });
    expect(p.route).toBe('/krug?custom=1');
  });
});
