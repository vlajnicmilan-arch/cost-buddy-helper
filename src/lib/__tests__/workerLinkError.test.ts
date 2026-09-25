import { describe, it, expect } from 'vitest';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import {
  WORKER_LINK_ERROR_KEYS,
  resolveWorkerLinkErrorCode,
  workerLinkErrorKey,
  sumEntryHours,
} from '@/lib/workerLinkError';

const get = (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj);

describe('workerLinkError', () => {
  it('maps every RPC code to its own key', () => {
    expect(resolveWorkerLinkErrorCode('ERROR: not_authorized')).toBe('not_authorized');
    expect(resolveWorkerLinkErrorCode('user_already_linked_to_other_worker')).toBe('user_already_linked_to_other_worker');
    expect(resolveWorkerLinkErrorCode('worker_not_found')).toBe('worker_not_found');
    expect(resolveWorkerLinkErrorCode('not_authenticated')).toBe('not_authenticated');
    expect(workerLinkErrorKey('not_authorized')).toBe('projects.linkNotAuthorized');
  });

  it('falls back to generic only for unknown codes', () => {
    expect(resolveWorkerLinkErrorCode('column "full_name" does not exist')).toBe('unknown');
    expect(workerLinkErrorKey(undefined)).toBe('common.error');
  });

  it('every key exists in hr/en/de', () => {
    const keys = [...Object.values(WORKER_LINK_ERROR_KEYS), 'projects.workerLinkedWithBackfillHours'];
    for (const loc of [hr, en, de]) for (const k of keys) expect(typeof get(loc, k)).toBe('string');
  });

  it('sums transferred hours', () => {
    expect(sumEntryHours([{ actual_hours: 4 }, { actual_hours: '8' }, { actual_hours: null }])).toBe(12);
  });
});
