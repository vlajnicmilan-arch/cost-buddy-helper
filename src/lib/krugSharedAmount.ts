/**
 * Krug "Dijeli samo X" (varijanta A) — čisti helperi.
 *
 * Dijeljena svota je u valuti troška. NULL/prazno = cijeli iznos (kao prije).
 * Server (krug_override_propose) je autoritativan; ovo je samo rana provjera.
 */
import { parseMoneyStrict } from '@/lib/money';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

export type SharedAmountResult =
  | { ok: true; value: number | null }
  | { ok: false; error: 'invalid' | 'exceeds' };

export function validateSharedAmount(raw: string, expenseAmount: number): SharedAmountResult {
  const s = (raw ?? '').trim();
  if (s === '') return { ok: true, value: null };
  const parsed = parseMoneyStrict(s);
  if (!parsed.valid || parsed.value <= 0) return { ok: false, error: 'invalid' };
  const value = Math.round(parsed.value * 100) / 100;
  if (value > Math.abs(expenseAmount) + 1e-9) return { ok: false, error: 'exceeds' };
  return { ok: true, value };
}

/** Svota koja stvarno ulazi u raspodjelu — isto pravilo kao LEAST u preview-u. */
export function effectiveSharedAmount(sharedAmount: number | null | undefined, expenseAmount: number): number {
  const total = Math.abs(expenseAmount);
  if (sharedAmount == null) return total;
  return Math.min(Number(sharedAmount), total);
}

/** Vrijedi li prikazati "dijeli se X od Y" (tj. dijeli se manje od cijelog iznosa). */
export function isPartialShare(sharedAmount: number | null | undefined, expenseAmount: number): boolean {
  if (sharedAmount == null) return false;
  return effectiveSharedAmount(sharedAmount, expenseAmount) < Math.abs(expenseAmount);
}

/** Doslovni code/message greške spremanja prijedloga + otisak objave. */
export function logKrugOverrideProposeError(
  err: unknown,
  ctx: { expenseId: string; sharedAmount: number | null },
): void {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'krug_override_propose_error',
    severity: 'error',
    details: {
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
      expense_id: ctx.expenseId,
      shared_amount: ctx.sharedAmount,
    },
  });
}
