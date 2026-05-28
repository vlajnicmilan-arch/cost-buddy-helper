/**
 * Receipt Items Recovery
 *
 * Read-only helpers for finding scanned receipt items that were never persisted
 * to `receipt_items` in the cloud due to the write-path bug (Index.tsx wrapper
 * dropping the `items` argument).
 *
 * NOTHING in this module writes to the cloud, the device cache, or any other
 * storage. The only mutation is the explicit `restoreItems()` call which
 * inserts into `receipt_items` for a single expense_id passed in by the caller.
 */

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const isNative = Capacitor.isNativePlatform();

export interface LocalCachedItem {
  name: string;
  quantity?: number | null;
  unit_price?: number | null;
  total_price: number;
}

export interface LocalCachedReceipt {
  key: string;                  // storage key, e.g. receipt_cache_1716...
  timestampMs: number;          // parsed from key
  amount: number | null;
  merchant: string | null;
  date: string | null;          // ISO date string from scan, may be null
  itemCount: number;
  items: LocalCachedItem[];
  raw: any;                     // full parsed object for debugging
}

export interface CloudExpenseMatch {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  ai_extracted: boolean | null;
  existing_item_count: number;
}

export interface RecoveryPair {
  local: LocalCachedReceipt;
  candidate: CloudExpenseMatch | null;
  status: 'safe_to_restore' | 'has_items_already' | 'no_match' | 'multiple_candidates' | 'merchant_mismatch';
  reason?: string;
}

// ---------- Step 1: read local cache ----------

async function listKeysWithPrefix(prefix: string): Promise<string[]> {
  if (isNative) {
    const { keys } = await Preferences.keys();
    return keys.filter((k) => k.startsWith(prefix));
  }
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}

async function readKey(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function listLocalCachedReceipts(): Promise<LocalCachedReceipt[]> {
  const keys = await listKeysWithPrefix('receipt_cache_');
  const out: LocalCachedReceipt[] = [];

  for (const key of keys) {
    const raw = await readKey(key);
    if (!raw) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const timestampMs = Number(key.replace('receipt_cache_', '')) || 0;
    const items: LocalCachedItem[] = Array.isArray(parsed?.items)
      ? parsed.items.map((it: any) => ({
          name: typeof it?.name === 'string' ? it.name : '',
          quantity: typeof it?.quantity === 'number' ? it.quantity : null,
          unit_price: typeof it?.unit_price === 'number' ? it.unit_price : null,
          total_price: typeof it?.total_price === 'number' ? it.total_price : 0,
        }))
      : [];

    if (items.length === 0) continue; // nothing to recover

    out.push({
      key,
      timestampMs,
      amount: typeof parsed?.amount === 'number' ? parsed.amount : null,
      merchant: typeof parsed?.merchant === 'string' ? parsed.merchant : null,
      date: typeof parsed?.date === 'string' ? parsed.date : null,
      itemCount: items.length,
      items,
      raw: parsed,
    });
  }

  return out.sort((a, b) => b.timestampMs - a.timestampMs);
}

// ---------- Step 2: match with cloud expenses (read-only) ----------

/**
 * Returns ALL expense-type rows for the current user in the relevant date
 * range. Previously restricted to ai_extracted=true, but many cloud rows lost
 * that flag after edits / recurring matching / transfer detection, so they were
 * missed even though they were the right parnjak.
 */
async function fetchCandidateExpenses(
  userId: string,
  fromIso: string,
  toIso: string
): Promise<CloudExpenseMatch[]> {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, date, amount, description, ai_extracted, type')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', fromIso)
    .lte('date', toIso)
    .order('date', { ascending: false })
    .limit(5000);
  if (error) throw error;
  if (!expenses || expenses.length === 0) return [];

  const ids = expenses.map((e) => e.id);
  const { data: itemRows, error: itemErr } = await supabase
    .from('receipt_items')
    .select('expense_id')
    .in('expense_id', ids);
  if (itemErr) throw itemErr;

  const counts = new Map<string, number>();
  for (const row of itemRows ?? []) {
    counts.set(row.expense_id, (counts.get(row.expense_id) ?? 0) + 1);
  }

  return expenses.map((e) => ({
    id: e.id,
    date: e.date,
    amount: Number(e.amount),
    description: e.description ?? null,
    ai_extracted: e.ai_extracted,
    existing_item_count: counts.get(e.id) ?? 0,
  }));
}

function normalizeMerchant(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9čćžšđ ]/gi, '').trim();
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 999;
  return Math.abs(da - db) / 86400000;
}

const STRICT_DATE_WINDOW_DAYS = 1;
const LOOSE_DATE_WINDOW_DAYS = 30;

export async function buildRecoveryPairs(): Promise<RecoveryPair[]> {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const userId = authData?.user?.id;
  if (!userId) throw new Error('Nisi prijavljen');

  const local = await listLocalCachedReceipts();
  if (local.length === 0) return [];

  // DB fetch window must cover both scan timestamps AND receipt dates,
  // padded by the loose date window so all candidate matches are included.
  const allTs: number[] = [];
  for (const l of local) {
    allTs.push(l.timestampMs);
    if (l.date) {
      const t = new Date(l.date).getTime();
      if (!isNaN(t)) allTs.push(t);
    }
  }
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const pad = (LOOSE_DATE_WINDOW_DAYS + 1) * 86400000;
  const fromIso = new Date(minTs - pad).toISOString().slice(0, 10);
  const toIso = new Date(maxTs + pad).toISOString().slice(0, 10);

  const cloud = await fetchCandidateExpenses(userId, fromIso, toIso);

  const pairs: RecoveryPair[] = local.map((l) => {
    const targetDate = l.date || new Date(l.timestampMs).toISOString().slice(0, 10);
    const localMerchantN = normalizeMerchant(l.merchant);

    // Strict: amount + ±1d + merchant text overlap
    const strictCandidates = cloud.filter((c) => {
      if (l.amount == null) return false;
      if (Math.abs(c.amount - l.amount) > 0.01) return false;
      if (dateDiffDays(c.date, targetDate) > STRICT_DATE_WINDOW_DAYS) return false;
      if (!localMerchantN) return true;
      const descN = normalizeMerchant(c.description);
      return descN.includes(localMerchantN) || localMerchantN.includes(descN);
    });

    // Loose: amount + ±7d (description may have been rewritten)
    const loose = cloud.filter((c) => {
      if (l.amount == null) return false;
      if (Math.abs(c.amount - l.amount) > 0.01) return false;
      return dateDiffDays(c.date, targetDate) <= LOOSE_DATE_WINDOW_DAYS;
    });

    const candidates = strictCandidates.length > 0 ? strictCandidates : loose;
    const isLooseOnly = strictCandidates.length === 0 && loose.length > 0;


    if (candidates.length === 0) {
      return { local: l, candidate: null, status: 'no_match' };
    }
    if (candidates.length > 1) {
      const sorted = [...candidates].sort(
        (a, b) => dateDiffDays(a.date, targetDate) - dateDiffDays(b.date, targetDate)
      );
      return {
        local: l,
        candidate: sorted[0],
        status: 'multiple_candidates',
        reason: `${candidates.length} kandidata`,
      };
    }
    const c = candidates[0];
    if (c.existing_item_count > 0) {
      return {
        local: l,
        candidate: c,
        status: 'has_items_already',
        reason: `${c.existing_item_count} artikala već postoji`,
      };
    }
    if (isLooseOnly) {
      return {
        local: l,
        candidate: c,
        status: 'merchant_mismatch',
        reason: `Opis u oblaku: "${c.description ?? ''}" — provjeri pa potvrdi`,
      };
    }
    return { local: l, candidate: c, status: 'safe_to_restore' };
  });

  return pairs;
}

// ---------- Step 4 (only called after explicit user confirmation) ----------

export interface RestoreResult {
  key: string;
  expenseId: string;
  inserted: number;
  error?: string;
}

/**
 * Inserts items into receipt_items for a single expense. Caller MUST verify
 * `existing_item_count === 0` before calling. We re-check inside as a safety net.
 */
export async function restoreItemsForPair(pair: RecoveryPair): Promise<RestoreResult> {
  if (!pair.candidate) {
    return { key: pair.local.key, expenseId: '', inserted: 0, error: 'no_candidate' };
  }
  const expenseId = pair.candidate.id;

  // Safety re-check: ensure no items currently exist.
  const { count, error: countErr } = await supabase
    .from('receipt_items')
    .select('id', { count: 'exact', head: true })
    .eq('expense_id', expenseId);
  if (countErr) {
    return { key: pair.local.key, expenseId, inserted: 0, error: countErr.message };
  }
  if ((count ?? 0) > 0) {
    return {
      key: pair.local.key,
      expenseId,
      inserted: 0,
      error: 'already_has_items',
    };
  }

  const rows = pair.local.items
    .filter((i) => i.name && i.name.trim().length > 0)
    .map((i) => ({
      expense_id: expenseId,
      name: i.name.trim(),
      quantity: i.quantity ?? null,
      unit_price: i.unit_price ?? null,
      total_price: Number(i.total_price) || 0,
    }));

  if (rows.length === 0) {
    return { key: pair.local.key, expenseId, inserted: 0, error: 'no_named_items' };
  }

  const { error: insErr, data: inserted } = await supabase
    .from('receipt_items')
    .insert(rows)
    .select('id');

  if (insErr) {
    return { key: pair.local.key, expenseId, inserted: 0, error: insErr.message };
  }

  // Audit log (best-effort, non-blocking).
  try {
    await supabase.from('app_diagnostics_logs').insert({
      event: 'receipt_items_recovery_restored',
      severity: 'info',
      details: {
        expense_id: expenseId,
        local_key: pair.local.key,
        inserted_count: inserted?.length ?? 0,
        merchant: pair.local.merchant,
        amount: pair.local.amount,
      },
    } as any);
  } catch {
    // ignore audit failure
  }

  return { key: pair.local.key, expenseId, inserted: inserted?.length ?? 0 };
}
