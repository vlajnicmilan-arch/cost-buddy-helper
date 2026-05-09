import { supabase } from '@/integrations/supabase/client';

/**
 * Owner Loan Logic — auto-creates a "company owes owner" debt entry
 * when a business expense is paid from a personal payment source.
 *
 * Standard accounting practice: owner loan to company.
 */

interface OwnerLoanInput {
  expenseId: string;
  userId: string;
  businessProfileId: string;
  paymentSource: string | null | undefined;
  amount: number;
  description: string;
  ownerLoanContactName?: string;
  loanDescriptionPrefix?: string;
}

/**
 * Returns the UUID extracted from a `custom:{uuid}` payment source string,
 * or null if the value is not a custom payment source reference.
 */
const extractCustomSourceId = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource) return null;
  if (paymentSource.startsWith('custom:')) {
    const id = paymentSource.replace('custom:', '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return id;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentSource)) {
    return paymentSource;
  }
  return null;
};

/**
 * Detect if a business expense was paid using a personal account.
 * Returns true when the payment source belongs to a different business profile,
 * or has no business_profile_id (i.e. is personal).
 */
export const isCrossModePersonalPayment = async (
  paymentSource: string | null | undefined,
  expenseBusinessProfileId: string | null | undefined
): Promise<{ isCross: boolean; sourceBusinessProfileId: string | null }> => {
  if (!expenseBusinessProfileId) return { isCross: false, sourceBusinessProfileId: null };
  const sourceId = extractCustomSourceId(paymentSource);
  if (!sourceId) return { isCross: false, sourceBusinessProfileId: null };

  const { data, error } = await supabase
    .from('custom_payment_sources')
    .select('business_profile_id')
    .eq('id', sourceId)
    .maybeSingle();

  if (error || !data) return { isCross: false, sourceBusinessProfileId: null };

  const sourceBpId = (data as any).business_profile_id || null;
  return {
    isCross: sourceBpId !== expenseBusinessProfileId,
    sourceBusinessProfileId: sourceBpId,
  };
};

/**
 * Creates an owner-loan business debt entry if the expense was paid from a personal source.
 * Best-effort: never throws — failures are logged but do not block the calling flow.
 */
export const createOwnerLoanIfCrossMode = async (input: OwnerLoanInput): Promise<void> => {
  try {
    const { isCross } = await isCrossModePersonalPayment(input.paymentSource, input.businessProfileId);
    if (!isCross) return;

    // Avoid duplicates — skip if a loan already exists for this expense
    const { data: existing } = await supabase
      .from('business_debts' as any)
      .select('id')
      .eq('source_expense_id', input.expenseId)
      .maybeSingle();

    if (existing) return;

    const contactName = input.ownerLoanContactName || 'Vlasnik (pozajmica)';
    const prefix = input.loanDescriptionPrefix || 'Plaćeno iz osobnog računa';

    await supabase.from('business_debts' as any).insert({
      user_id: input.userId,
      business_profile_id: input.businessProfileId,
      type: 'payable',
      contact_name: contactName,
      description: `${prefix}: ${input.description}`,
      amount: input.amount,
      paid_amount: 0,
      status: 'active',
      source_expense_id: input.expenseId,
    } as any);
  } catch (e) {
    console.error('[ownerLoanLogic] Failed to create owner loan:', e);
  }
};

/**
 * Update a previously auto-created owner-loan when the source expense changes.
 * If the expense becomes non-cross-mode, the loan is cancelled.
 */
export const syncOwnerLoanForExpense = async (input: OwnerLoanInput): Promise<void> => {
  try {
    const { data: existing } = await supabase
      .from('business_debts' as any)
      .select('id, paid_amount, status')
      .eq('source_expense_id', input.expenseId)
      .maybeSingle();

    const { isCross } = await isCrossModePersonalPayment(input.paymentSource, input.businessProfileId);

    if (existing && !isCross) {
      // Loan no longer applies — mark as cancelled (user may want to keep history)
      await supabase
        .from('business_debts' as any)
        .update({ status: 'cancelled' } as any)
        .eq('id', (existing as any).id);
      return;
    }

    if (!existing && isCross) {
      await createOwnerLoanIfCrossMode(input);
      return;
    }

    if (existing && isCross) {
      const prefix = input.loanDescriptionPrefix || 'Plaćeno iz osobnog računa';
      await supabase
        .from('business_debts' as any)
        .update({
          amount: input.amount,
          description: `${prefix}: ${input.description}`,
          status: 'active',
        } as any)
        .eq('id', (existing as any).id);
    }
  } catch (e) {
    console.error('[ownerLoanLogic] Failed to sync owner loan:', e);
  }
};

/**
 * Delete the auto-created loan tied to an expense (called when the expense is deleted).
 * Note: ON DELETE SET NULL on FK preserves the debt record itself; this fully removes it.
 */
export const deleteOwnerLoanForExpense = async (expenseId: string): Promise<void> => {
  try {
    await supabase
      .from('business_debts' as any)
      .delete()
      .eq('source_expense_id', expenseId);
  } catch (e) {
    console.error('[ownerLoanLogic] Failed to delete owner loan:', e);
  }
};

/**
 * Mark an owner loan as forgiven (status='cancelled') without deleting it
 * or touching the source expense. Semantics: owner donates to company.
 * Source transaction stays visible in both personal and business views.
 */
export const forgiveOwnerLoan = async (debtId: string): Promise<void> => {
  await supabase
    .from('business_debts' as any)
    .update({ status: 'cancelled' } as any)
    .eq('id', debtId);
};
