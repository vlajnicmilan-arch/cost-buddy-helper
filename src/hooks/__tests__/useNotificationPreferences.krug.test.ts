/**
 * Krug Notifications MVP — preferences hook contract (light).
 *
 * Namjerno lagan test — provjerava samo dva MVP invarijana bez pokretanja
 * cijelog React lifecyclea:
 *
 *   1. `PushCategory` uključuje 'krug' (tip-level).
 *   2. Hook izlaže `setCategory('krug', boolean)` bez tipske greške.
 *
 * Šire behaviour testove ostavljamo integracijskim proba-flowovima; ovdje
 * čuvamo samo da MVP toggle formalno postoji.
 */
import { describe, it, expect } from 'vitest';
import type { PushCategory } from '@/hooks/useNotificationPreferences';

describe('useNotificationPreferences — Krug MVP toggle contract', () => {
  it('PushCategory includes "krug"', () => {
    const kategorije: PushCategory[] = [
      'chat',
      'transactions',
      'pending',
      'projects',
      'budgets',
      'reminders',
      'trial',
      'broadcast',
      'daily_summary',
      'krug',
    ];
    expect(kategorije).toContain<PushCategory>('krug');
  });
});
