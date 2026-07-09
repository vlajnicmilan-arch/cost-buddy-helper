/**
 * T8 frontend — wrapperi za approval RPC-e (A1, A2, A4, A5).
 *
 * Wave 1 SVJESNO ne pokriva A3, A6, A7. UI sloj koji troši ove hookove mora
 * jasno komunicirati da `predlozena` stanja u v1 nemaju automatski 48h expiry
 * (Wave 1.5 zatvara).
 *
 * Idempotencija ide preko `client_request_id` koji se generira po pozivu.
 * RPC dedup tablica (`krug_act_dedup`) drži ishod 24h.
 *
 * WS-Approval-Fix v1:
 * - uspješan A1/A2/A5 (i A4 kroz withdraw) invalidira i Krug pending queue
 *   (`['krug','pending-expenses']`) uz `['expenses']`. Bez toga se queue u
 *   `KrugApprovalQueue` osvježavao samo focus/stale refetchom.
 * - outcome poruke se mapiraju u i18n; nikad ne prikazujemo sirovi enum.
 * - success poruke su specifične za akt (Potvrđeno / Odbijeno / Ponovno predloženo / Povučeno).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import i18n from '@/i18n';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

export type KrugGovernanceAct = 'A1' | 'A2' | 'A5';
type AnyAct = KrugGovernanceAct | 'A4';

export interface KrugActOutcome {
  outcome: string;
  expense_id?: string;
  krug_id?: string;
  previous_status?: string | null;
  new_status?: string | null;
  replayed?: boolean;
}

const OK_OUTCOMES = new Set([
  'ok_confirmed',
  'ok_negated',
  'ok_reproposed',
  'ok_withdrawn',
  'noop_already_in_target_state',
]);

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Poruka uspjeha ovisi o aktu — generički success nije dovoljno pošten. */
function successMessage(act: AnyAct, outcome: string): string {
  if (outcome === 'noop_already_in_target_state') {
    return i18n.t('krug.act.success.noop', 'Već je u tom stanju.');
  }
  switch (act) {
    case 'A1':
      return i18n.t('krug.act.success.A1', 'Trošak je potvrđen.');
    case 'A2':
      return i18n.t('krug.act.success.A2', 'Trošak je odbijen.');
    case 'A5':
      return i18n.t('krug.act.success.A5', 'Prijedlog je vraćen na odlučivanje.');
    case 'A4':
      return i18n.t('krug.act.success.A4', 'Prijedlog je povučen.');
    default:
      return i18n.t('krug.act.success.generic', 'Spremljeno.');
  }
}

/** Sve non-OK outcome vrijednosti iz RPC-a mapirane u lokalizirani tekst. */
function errorMessageForOutcome(outcome: string): string {
  const key = `krug.act.error.${outcome}`;
  const fallbackByOutcome: Record<string, string> = {
    unauthenticated: 'Prijava je istekla. Prijavi se ponovo.',
    invalid_act: 'Nepoznata akcija.',
    missing_client_request_id: 'Interna greška: nedostaje ID zahtjeva.',
    not_found: 'Trošak više ne postoji.',
    not_in_shared_flow: 'Trošak nije u zajedničkom toku Kruga.',
    author_cannot_govern: 'Autor troška ne može sam odlučivati o njemu.',
    not_full_member: 'Nemaš pravo odluke u ovom Krugu.',
    not_author: 'Samo autor troška može ovo napraviti.',
    wrong_state: 'Trošak više nije u stanju koje dozvoljava ovu akciju.',
    unknown: 'Nepoznata greška. Pokušaj ponovo.',
  };
  const fallback = fallbackByOutcome[outcome] ?? fallbackByOutcome.unknown;
  return i18n.t(key, fallback);
}

/** Network / RLS / drugi throw iz supabase-js. Poruka se ne pokazuje sirova. */
function errorMessageForThrown(err: any): string {
  // Namjerno ne prosljeđujemo `err.message` — često sadrži tehnički trag koji
  // korisniku ne pomaže. Ako je potrebno detaljno debagiranje, ide u konzolu.
  if (typeof console !== 'undefined' && err) {
    // eslint-disable-next-line no-console
    console.error('[krug_apply_act]', err);
  }
  return i18n.t(
    'krug.act.error.network',
    'Trenutno nije moguće odraditi akciju. Provjeri vezu i pokušaj ponovo.',
  );
}

function invalidateApprovalSurfaces(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['expenses'] });
  // Krug approval queue (`useKrugPendingExpenses`) koristi zaseban namespace.
  // Prefix match hvata sve krugId-jeve — jeftinije i sigurnije od preciznog kljuca.
  qc.invalidateQueries({ queryKey: ['krug', 'pending-expenses'] });
}

function reportOutcome(
  qc: ReturnType<typeof useQueryClient>,
  act: AnyAct,
  res: KrugActOutcome,
) {
  if (OK_OUTCOMES.has(res.outcome)) {
    showSuccess(successMessage(act, res.outcome));
    invalidateApprovalSurfaces(qc);
  } else {
    showError(errorMessageForOutcome(res.outcome));
  }
}

/** A1 / A2 / A5 — governance + autor-re-propose; sve kroz `krug_apply_act`. */
export function useKrugApplyAct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      expenseId: string;
      act: KrugGovernanceAct;
      /** Opcionalno; ako nije zadan, generira se novi UUID po pozivu. */
      clientRequestId?: string;
    }) => {
      const { data, error } = await supabase.rpc('krug_apply_act', {
        p_expense_id: vars.expenseId,
        p_act: vars.act,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return {
        act: vars.act,
        result: (data ?? { outcome: 'unknown' }) as unknown as KrugActOutcome,
      };
    },
    onSuccess: ({ act, result }) => reportOutcome(qc, act, result),
    onError: (err: any) => showError(errorMessageForThrown(err)),
  });
}

/** A4 — autor hard-withdraw u predloženom toku; soft-delete kroz RPC. */
export function useKrugWithdraw() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { expenseId: string; clientRequestId?: string }) => {
      const { data, error } = await supabase.rpc('krug_withdraw', {
        p_expense_id: vars.expenseId,
        p_client_request_id: vars.clientRequestId ?? newRequestId(),
      });
      if (error) throw error;
      return (data ?? { outcome: 'unknown' }) as unknown as KrugActOutcome;
    },
    onSuccess: (res) => reportOutcome(qc, 'A4', res),
    onError: (err: any) => showError(errorMessageForThrown(err)),
  });
}
