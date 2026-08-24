import { describe, it, expect } from 'vitest';
import {
  resolveMergeFailureCode,
  describeMergeError,
  MERGE_FAILURE_CODES,
  MERGE_FAILURE_I18N_KEY,
} from '@/lib/mergeFailureReason';

describe('mergeFailureReason', () => {
  it('recognises every RPC guard code inside a postgres message', () => {
    for (const code of MERGE_FAILURE_CODES) {
      const err = { message: `${code}`, code: 'P0001' };
      expect(resolveMergeFailureCode(err)).toBe(code);
    }
  });

  it('prefers the specific code over its substring', () => {
    expect(resolveMergeFailureCode({ message: 'manual_not_found' })).toBe('manual_not_found');
    expect(resolveMergeFailureCode({ message: 'bank_not_found' })).toBe('bank_not_found');
    expect(resolveMergeFailureCode({ message: 'manual_deleted' })).toBe('manual_deleted');
    expect(resolveMergeFailureCode({ message: 'bank_deleted' })).toBe('bank_deleted');
  });

  it('falls back to unknown', () => {
    expect(resolveMergeFailureCode({ message: 'deadlock detected' })).toBe('unknown');
    expect(resolveMergeFailureCode(null)).toBe('unknown');
  });

  it('has an i18n key for every code', () => {
    for (const code of [...MERGE_FAILURE_CODES, 'missing_id', 'unknown'] as const) {
      expect(MERGE_FAILURE_I18N_KEY[code]).toBeTruthy();
    }
  });

  it('describeMergeError keeps db code and truncated message', () => {
    const out = describeMergeError({ message: 'date_too_far', code: 'P0001' });
    expect(out).toEqual({ code: 'date_too_far', db_code: 'P0001', db_message: 'date_too_far' });
    const long = describeMergeError({ message: 'x'.repeat(900) });
    expect(long.db_message?.length).toBe(500);
  });
});
