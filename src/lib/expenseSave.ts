/**
 * Spremanje troška u JEDNOM mrežnom krugu.
 *
 * Prije: upis troška → provjera duplikata → upis stavki → čekanje
 * dijagnostičkog zapisa (3–4 kruga bez roka; na slaboj vezi 5+ s, a zaglavljeni
 * poziv je značio beskonačni vrtuljak).
 *
 * Sada: jedan poziv baze-funkcije `create_expense_with_items` (SECURITY
 * INVOKER — RLS i okidači ostaju na snazi) uz rok od 10 s i JEDAN siguran
 * ponovni pokušaj. Ponavljanje je sigurno jer klijent generira `id` troška
 * prije slanja, a funkcija na postojeći `id` vraća postojeći redak.
 */
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/fetchTimeout';
import { beginWeakFetch, endWeakFetch } from '@/lib/weakConnection';
import { runWithTransientRetry } from '@/lib/expenseFetchRetry';

/** Rok za jedan pokušaj spremanja. */
export const EXPENSE_SAVE_TIMEOUT_MS = 10_000;
/** Razmak prije jedinog ponovnog pokušaja. */
export const EXPENSE_SAVE_RETRY_DELAY_MS = 600;

export type SaveOutcome = 'ok' | 'retry_ok' | 'failed';

export interface SaveExpenseResult<T = Record<string, unknown>> {
  row: T;
  attempts: number;
  outcome: Exclude<SaveOutcome, 'failed'>;
  rpcMs: number;
}

export type SaveRpc = (
  expense: Record<string, unknown>,
  items: unknown[],
  signal: AbortSignal,
) => Promise<unknown>;

const defaultRpc: SaveRpc = async (expense, items, signal) => {
  const { data, error } = await (supabase.rpc as any)('create_expense_with_items', {
    p_expense: expense,
    p_items: items,
  }).abortSignal(signal);
  if (error) throw error;
  return data;
};

export interface SaveOptions {
  rpc?: SaveRpc;
  timeoutMs?: number;
  /** Injektabilni sleep (testovi šalju no-op). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Jedan poziv + najviše jedan ponovni pokušaj. Dok traje ponavljanje pali se
 * ista tiha traka kao kod dohvata ("Veza je slaba — osvježavam…").
 */
export async function saveExpenseWithItems<T = Record<string, unknown>>(
  expense: Record<string, unknown>,
  items: unknown[] = [],
  options: SaveOptions = {},
): Promise<SaveExpenseResult<T>> {
  const rpc = options.rpc ?? defaultRpc;
  const timeoutMs = options.timeoutMs ?? EXPENSE_SAVE_TIMEOUT_MS;
  const startedAt = Date.now();
  let weak = false;

  try {
    const { result, attempts } = await runWithTransientRetry<unknown>(
      () => withTimeout((signal) => rpc(expense, items, signal), timeoutMs),
      {
        delays: [EXPENSE_SAVE_RETRY_DELAY_MS],
        sleep: options.sleep,
        onRetry: () => {
          weak = true;
          beginWeakFetch('expense_save');
        },
      },
    );
    if (weak) endWeakFetch('expense_save', 'recovered');
    return {
      row: result as T,
      attempts,
      outcome: attempts > 1 ? 'retry_ok' : 'ok',
      rpcMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (weak) endWeakFetch('expense_save', 'failed');
    // Broj pokušaja za dijagnostiku: ponavljanje se dogodilo samo ako je
    // `onRetry` upalio tihu traku.
    try {
      (error as any).saveAttempts = weak ? 2 : 1;
      (error as any).saveMs = Date.now() - startedAt;
    } catch {
      /* neki throwani objekti nisu proširivi */
    }
    throw error;
  }
}

/**
 * Stabilan id po pokušaju spremanja.
 *
 * Ručni ponovni pokušaj ("Pokušaj ponovno") mora poslati ISTI id, inače bi
 * izgubljeni odgovor prvog pokušaja proizveo duplikat. Ključ je potpis unosa;
 * nakon uspjeha pozivatelj oslobađa ključ.
 */
const SAVE_ID_TTL_MS = 5 * 60_000;
const idCache = new Map<string, { id: string; at: number }>();

function newUuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback za okruženja bez Web Crypto (stariji WebView).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function stableSaveId(signature: string, now: number = Date.now()): string {
  const hit = idCache.get(signature);
  if (hit && now - hit.at < SAVE_ID_TTL_MS) return hit.id;
  const id = newUuid();
  idCache.set(signature, { id, at: now });
  return id;
}

export function releaseSaveId(signature: string) {
  idCache.delete(signature);
}

/** Testna pomoćna funkcija. */
export function __resetSaveIds() {
  idCache.clear();
}
