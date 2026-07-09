/**
 * Krug Notifications MVP — client navigation mapping.
 *
 * Provjerava da svih 6 MVP tipova (`krug_member_added`, `krug_expense_*`,
 * `krug_deletion_requested`, `krug_deleted`) rezolvira u rutu `/krug`
 * kroz `normalizePayload.legacyResolve` bez oslanjanja na `route` polje u
 * `data` (server writer namjerno ne postavlja `route` na strani baze —
 * legacy resolver je jedini izvor navigacije).
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
    it(`${type} → /krug`, () => {
      const p = normalizePayload(type, { krug_id: '00000000-0000-0000-0000-000000000000' });
      expect(p.type).toBe(type);
      expect(p.route).toBe('/krug');
      expect(p.fallback_route).toBe('/krug');
      // MVP namjerno nema highlight — /krug lista još ne rendera per-id marker.
      expect(p.highlight).toBeNull();
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
