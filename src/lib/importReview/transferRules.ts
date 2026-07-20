/**
 * Import Transfer Rules — engine + Supabase IO helpers.
 *
 * Purpose: teach the statement importer to reclassify certain bank rows
 * (e.g. "aircash.eu, Visa Direct" charge on Milan's Revolut card) as an
 * INTERNAL TRANSFER to another of the user's wallets (Aircash), instead of
 * an expense.
 *
 * Rule key (Milanova odluka):
 *   (user_id, merchant_key, source_wallet_key)
 * — isti trgovac s DRUGOG izvornog novčanika NE aktivira automatski prijenos,
 * pravilo mora biti eksplicitno naučeno za taj izvor.
 *
 * merchant_key   — normalizeMerchant(bankMerchantName)
 * source_wallet_key — resolvePaymentSourceKey(row.paymentSource) (npr. `custom:<uuid>`)
 * target         — UUID ciljnog `custom_payment_sources` reda (goes into expenses.income_source_id)
 *
 * Redoslijed primjene (dogovoreno):
 *   1) pdfPostProcess keyword safety-net (deterministic, cross-user) → PRVI
 *   2) transferRules engine (user-specific naučena pravila)          → DRUGI
 *
 * React-free, Supabase interface je minimalan (za unit testove).
 */

import { normalizeMerchant } from '../duplicateDetection';
import { resolvePaymentSourceKey } from '../paymentSource/resolve';

export interface TransferRule {
  readonly id: string;
  readonly userId: string;
  readonly merchantKey: string;
  readonly sourceWalletKey: string;
  readonly targetIncomeSourceId: string;
}

export interface TransferRuleMatchInput {
  readonly merchantName?: string | null;
  readonly paymentSource?: string | null;
}

export interface TransferRuleMatch {
  readonly rule: TransferRule;
  readonly merchantKey: string;
  readonly sourceWalletKey: string;
}

/**
 * Try to match a rule for a single imported bank row. Returns null if no rule
 * applies (empty merchant, no candidate in the pool, etc.). Pure.
 */
export function matchTransferRule(
  input: TransferRuleMatchInput,
  rules: readonly TransferRule[],
): TransferRuleMatch | null {
  const merchantKey = normalizeMerchant(input.merchantName ?? '');
  if (!merchantKey) return null;
  const sourceWalletKey = resolvePaymentSourceKey(input.paymentSource);
  if (sourceWalletKey === '__unknown__') return null;

  const rule = rules.find(
    (r) => r.merchantKey === merchantKey && r.sourceWalletKey === sourceWalletKey,
  );
  if (!rule) return null;

  return { rule, merchantKey, sourceWalletKey };
}

/**
 * Compute the composite key for a NEW rule the user is about to save
 * (used when they mark a row as transfer + tick "Zapamti"). Pure.
 */
export function buildTransferRuleKey(
  input: TransferRuleMatchInput,
): { merchantKey: string; sourceWalletKey: string } | null {
  const merchantKey = normalizeMerchant(input.merchantName ?? '');
  if (!merchantKey) return null;
  const sourceWalletKey = resolvePaymentSourceKey(input.paymentSource);
  if (sourceWalletKey === '__unknown__') return null;
  return { merchantKey, sourceWalletKey };
}

// ------------------------------- Supabase IO ---------------------------------

interface RuleRow {
  id: string;
  user_id: string;
  merchant_key: string;
  source_wallet_key: string;
  target_income_source_id: string;
}

/** Minimal supabase surface — makes IO helpers unit-testable. */
export interface TransferRulesSupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): Promise<{ data: RuleRow[] | null; error: { message: string } | null }>;
    };
    upsert(
      rows: Record<string, unknown>[],
      opts: { onConflict: string },
    ): {
      select(cols?: string): Promise<{ data: RuleRow[] | null; error: { message: string } | null }>;
    };
  };
}

export async function loadTransferRules(
  supabase: TransferRulesSupabaseClient,
  userId: string,
): Promise<TransferRule[]> {
  const res = await supabase
    .from('import_transfer_rules')
    .select('id,user_id,merchant_key,source_wallet_key,target_income_source_id')
    .eq('user_id', userId);
  if (res.error || !res.data) return [];
  return res.data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    merchantKey: r.merchant_key,
    sourceWalletKey: r.source_wallet_key,
    targetIncomeSourceId: r.target_income_source_id,
  }));
}

export interface UpsertRuleInput {
  readonly userId: string;
  readonly merchantKey: string;
  readonly sourceWalletKey: string;
  readonly targetIncomeSourceId: string;
}

/**
 * Idempotent upsert on (user_id, merchant_key, source_wallet_key). Called
 * from the executor BEFORE inserting expense rows so a mid-flight retry
 * doesn't insert twice AND doesn't lose the rule.
 */
export async function upsertTransferRules(
  supabase: TransferRulesSupabaseClient,
  rules: readonly UpsertRuleInput[],
): Promise<{ savedCount: number; errors: string[] }> {
  if (rules.length === 0) return { savedCount: 0, errors: [] };
  // Dedupe on the composite key — same batch may cover multiple rows for one rule.
  const byKey = new Map<string, UpsertRuleInput>();
  for (const r of rules) {
    const k = `${r.userId}::${r.merchantKey}::${r.sourceWalletKey}`;
    byKey.set(k, r);
  }
  const rows = Array.from(byKey.values()).map((r) => ({
    user_id: r.userId,
    merchant_key: r.merchantKey,
    source_wallet_key: r.sourceWalletKey,
    target_income_source_id: r.targetIncomeSourceId,
    last_used_at: new Date().toISOString(),
  }));
  try {
    const res = await supabase
      .from('import_transfer_rules')
      .upsert(rows, { onConflict: 'user_id,merchant_key,source_wallet_key' })
      .select('id');
    if (res.error) return { savedCount: 0, errors: [res.error.message] };
    return { savedCount: res.data?.length ?? 0, errors: [] };
  } catch (e) {
    return { savedCount: 0, errors: [e instanceof Error ? e.message : String(e)] };
  }
}
