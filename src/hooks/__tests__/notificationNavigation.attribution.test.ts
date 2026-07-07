/**
 * Notification interceptor za attribution: worker_payout_created/voided
 * MORAJU odbaciti standardnu route-based navigaciju i dispatchati
 * ATTRIBUTION_OPEN_EVENT s parseanim payloadom.
 *
 * Testiramo kroz grep izvora (pure logic guard) + preko dispatchera direktno
 * (već pokriveno events.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../useNotificationNavigation.ts'),
  'utf8',
);

describe('useNotificationNavigation attribution intercept', () => {
  it('importa dispatchAttributionOpen i parseAttributionPayload', () => {
    expect(SRC).toContain("from '@/lib/attribution/events'");
    expect(SRC).toContain('dispatchAttributionOpen');
    expect(SRC).toContain('parseAttributionPayload');
  });

  it('rukuje s worker_payout_created I worker_payout_voided tipovima', () => {
    expect(SRC).toContain("'worker_payout_created'");
    expect(SRC).toContain("'worker_payout_voided'");
  });

  it('intercept vraća true (nema toast "Stavka nije dostupna") kad je payload valjan', () => {
    // Blok mora sadržavati `return true` unutar if bloka
    const idx = SRC.indexOf('worker_payout_created');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 800);
    expect(block).toContain('dispatchAttributionOpen(attr)');
    expect(block).toContain('return true');
  });
});
