import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKER_PAYOUT_ERROR_CODES, resolveWorkerPayoutErrorCode, workerPayoutErrorKey } from '../receiptError';

const locale = (l: string) => JSON.parse(readFileSync(resolve(__dirname, `../../../i18n/locales/${l}.json`), 'utf8'));
const migration = (f: string) => readFileSync(resolve(__dirname, `../../../../drizzle/migrations/${f}`), 'utf8');
const raised = (sql: string) => [...sql.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]);

describe('worker payout error codes → translations', () => {
  it('every code raised by 0026 and 0028 has a dedicated entry', () => {
    const codes = new Set([
      ...raised(migration('0026_worker_confirm_payout_receipt.sql')),
      ...raised(migration('0028_worker_payout_not_received_real.sql')),
    ]);
    expect(codes.size).toBeGreaterThan(10);
    for (const c of codes) expect(WORKER_PAYOUT_ERROR_CODES).toContain(c);
  });

  it.each(['hr', 'en', 'de'])('every code has a %s translation', (l) => {
    const codes = locale(l).attribution.errors.codes;
    for (const c of WORKER_PAYOUT_ERROR_CODES) {
      expect(typeof codes[c], `${l}:${c}`).toBe('string');
      expect(codes[c].length).toBeGreaterThan(0);
    }
  });

  it.each(WORKER_PAYOUT_ERROR_CODES.map((c) => [c]))('%s maps to its own key', (c) => {
    expect(workerPayoutErrorKey({ code: 'P0001', message: c })).toBe(`attribution.errors.codes.${c}`);
  });

  it('longest code wins', () => {
    expect(resolveWorkerPayoutErrorCode({ message: 'source_not_found' })).toBe('source_not_found');
    expect(resolveWorkerPayoutErrorCode({ message: 'not_found' })).toBe('not_found');
  });

  it('unique violation is "already confirmed", unknown is generic', () => {
    expect(workerPayoutErrorKey({ code: '23505', message: 'dup' })).toBe('attribution.errors.codes.already_confirmed');
    expect(workerPayoutErrorKey({ code: 'XX000', message: 'boom' })).toBe('attribution.errors.generic');
  });
});
