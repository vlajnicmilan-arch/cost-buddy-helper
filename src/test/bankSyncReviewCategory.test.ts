import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: null }) }));

import { fetchReviewCategory } from '@/hooks/useBankSyncReviewQueue';
import { CATEGORY_TREE_VERSION } from '@/lib/categoryAssign';

const item = (type: 'expense' | 'income', description = 'KONZUM 123') => ({
  id: 'q', user_id: 'u', bank_account_id: 'b', stable_id: 's', reason: 'uncertain' as const, candidate_ids: [], created_at: '',
  payload: { amount: 1, date: '', type, description, currency: 'EUR', payment_source: '', wallet_id: 'w', payment_source_card_id: null, business_profile_id: null, bank_raw_line: '' },
});

describe('fetchReviewCategory — isti put kao ručni upis', () => {
  beforeEach(() => invoke.mockReset());
  it('trošak: categorize-transaction s oznakom stabla', async () => {
    invoke.mockResolvedValue({ data: { category: 'groceries' }, error: null });
    expect(await fetchReviewCategory(item('expense'))).toBe('groceries');
    expect(invoke).toHaveBeenCalledWith('categorize-transaction', {
      body: { description: 'KONZUM 123', merchant_name: '', category_tree_version: CATEGORY_TREE_VERSION },
    });
  });
  it('prihod i prekratak opis se ne šalju', async () => {
    expect(await fetchReviewCategory(item('income'))).toBeNull();
    expect(await fetchReviewCategory(item('expense', 'ab'))).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('greška → null, odluka ide dalje', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await fetchReviewCategory(item('expense'))).toBeNull();
  });
});
