/**
 * Krug Notifications — client navigation mapping.
 *
 * Svih 6 MVP tipova rezolvira preko tablice odredišta
 * (`krugNotificationRoutes.ts`), bez oslanjanja na `route` polje u `data`.
 * Kad payload nosi samo `krug_id`, odredište je ekran tog Kruga
 * (`/krug?id=<uuid>`) — nikad generični popis. Iznimka je `krug_deleted`,
 * gdje Krug više ne postoji pa se ide na popis.
 */
import { describe, it, expect } from 'vitest';
import { normalizePayload } from '@/lib/notificationPayload';

const KRUG_TYPES = [
  'krug_member_added',
  'krug_expense_proposed',
  'krug_expense_confirmed',
  'krug_expense_rejected',
  'krug_deletion_requested',
  'krug_deleted',
] as const;

describe('Krug notification payload mapping (MVP)', () => {
  for (const type of KRUG_TYPES) {
    it(`${type} → ekran Kruga`, () => {
      const krugId = '00000000-0000-0000-0000-000000000000';
      const p = normalizePayload(type, { krug_id: krugId });
      expect(p.type).toBe(type);
      if (type === 'krug_deleted') {
        expect(p.route).toBe('/krug');
        expect(p.highlight).toBeNull();
      } else {
        expect(p.route).toBe(`/krug?id=${krugId}`);
        expect(p.highlight).toEqual({ type: 'krug', id: krugId });
      }
      expect(p.fallback_route).toBe('/krug');
    });
  }

  it('honours explicit route override when server sets data.route', () => {
    const p = normalizePayload('krug_expense_proposed', {
      route: '/krug?custom=1',
      krug_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(p.route).toBe('/krug?custom=1');
  });
});
