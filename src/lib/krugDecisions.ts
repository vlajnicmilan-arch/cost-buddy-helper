/**
 * Krug — pure odlučivačka logika ekstrahirana iz SQL RPC-a.
 *
 * SVRHA: jedan izvor istine za ishode tranzicija koji se može testirati
 * bez Supabase mocka. SQL i ovi helperi MORAJU se podudarati po (input → outcome).
 * Divergencija = test fail = obavezna sinkronizacija.
 *
 * Pokriva tri RPC-a iz Implementation Sprint v1.1:
 *   - krug_set_privacy   (T7)
 *   - krug_apply_act     (T8, A1/A2/A5)
 *   - krug_withdraw      (T8, A4)
 *
 * Ne pokriva A3/A6/A7 — Wave 1.5.
 *
 * Helperi NE rade dohvat podataka i NE odlučuju o `replayed` (idempotencija
 * preko `krug_act_dedup` ostaje isključivo u SQL-u).
 */

export type KrugPrivacy = 'personal' | 'private' | 'shared';
export type KrugSharedStatus = 'predlozena' | 'potvrdjena' | 'nepotvrdjena';
export type KrugGovernanceAct = 'A1' | 'A2' | 'A5';

// ---------- krug_set_privacy ----------

export type SetPrivacyOutcome =
  | 'unauthenticated'
  | 'not_found'
  | 'not_in_krug_context'
  | 'not_author'
  | 'not_full_member'
  | 'wrong_state'
  | 'invalid_target'
  | 'noop_already_in_target_state'
  | 'ok_set_personal'
  | 'ok_set_private'
  | 'ok_proposed_shared';

export interface SetPrivacyInput {
  authenticated: boolean;
  expenseFound: boolean;
  hasKrugContext: boolean;
  isAuthor: boolean;
  isFullMember: boolean;
  prevPrivacy: KrugPrivacy | null;
  prevStatus: KrugSharedStatus | null;
  newPrivacy: KrugPrivacy;
}

export function decideSetPrivacy(i: SetPrivacyInput): SetPrivacyOutcome {
  if (!i.authenticated) return 'unauthenticated';
  if (!i.expenseFound) return 'not_found';
  if (!i.hasKrugContext) return 'not_in_krug_context';
  if (!i.isAuthor) return 'not_author';

  // Idempotencija: isto privacy, a za shared samo ako je već predlozena
  // (potvrdjena/nepotvrdjena prolaze kroz wrong_state niže jer iz shared se ne ide kroz T7).
  if (
    i.prevPrivacy === i.newPrivacy &&
    (i.newPrivacy !== 'shared' || i.prevStatus === 'predlozena')
  ) {
    return 'noop_already_in_target_state';
  }

  // Iz shared u bilo što = A7 (Wave 1.5). T7 ovdje vraća wrong_state.
  if (i.prevPrivacy === 'shared') return 'wrong_state';

  if (i.newPrivacy === 'shared') {
    if (!i.isFullMember) return 'not_full_member';
    return 'ok_proposed_shared';
  }

  if (i.newPrivacy === 'personal' || i.newPrivacy === 'private') {
    // Defenzivno (invarijanta T5): ako je status postavljen, krug_privacy je morao biti 'shared',
    // što smo već uhvatili gore. Ovaj guard štiti od korumpiranih redaka.
    if (i.prevStatus !== null) return 'wrong_state';
    return i.newPrivacy === 'personal' ? 'ok_set_personal' : 'ok_set_private';
  }

  return 'invalid_target';
}

// ---------- krug_apply_act (A1/A2/A5) ----------

export type ApplyActOutcome =
  | 'unauthenticated'
  | 'invalid_act'
  | 'missing_client_request_id'
  | 'not_found'
  | 'not_in_shared_flow'
  | 'author_cannot_govern'
  | 'not_full_member'
  | 'not_author'
  | 'wrong_state'
  | 'noop_already_in_target_state'
  | 'ok_confirmed'
  | 'ok_negated'
  | 'ok_reproposed';

export interface ApplyActInput {
  authenticated: boolean;
  expenseFound: boolean;
  inSharedFlow: boolean; // krug_id NOT NULL AND krug_privacy='shared'
  isAuthor: boolean;
  isFullMember: boolean;
  prevStatus: KrugSharedStatus | null;
  act: KrugGovernanceAct | string;
  clientRequestId: string | null | undefined;
}

export function decideApplyAct(i: ApplyActInput): ApplyActOutcome {
  if (!i.authenticated) return 'unauthenticated';
  if (i.act !== 'A1' && i.act !== 'A2' && i.act !== 'A5') return 'invalid_act';
  if (!i.clientRequestId || i.clientRequestId.length === 0) return 'missing_client_request_id';
  if (!i.expenseFound) return 'not_found';
  if (!i.inSharedFlow) return 'not_in_shared_flow';

  if (i.act === 'A1' || i.act === 'A2') {
    if (i.isAuthor) return 'author_cannot_govern';
    if (!i.isFullMember) return 'not_full_member';
    if (i.prevStatus !== 'predlozena') return 'wrong_state';
    return i.act === 'A1' ? 'ok_confirmed' : 'ok_negated';
  }

  // A5 — autor vraća svoju potvrdjena/nepotvrdjena natrag u predlozena.
  if (!i.isAuthor) return 'not_author';
  if (!i.isFullMember) return 'not_full_member';
  if (i.prevStatus !== 'potvrdjena' && i.prevStatus !== 'nepotvrdjena') return 'wrong_state';
  return 'ok_reproposed';
}

// ---------- krug_withdraw (A4) ----------

export type WithdrawOutcome =
  | 'unauthenticated'
  | 'missing_client_request_id'
  | 'not_found'
  | 'noop_already_in_target_state' // već soft-deletano
  | 'not_author'
  | 'not_in_shared_flow'
  | 'not_full_member'
  | 'wrong_state'
  | 'ok_withdrawn';

export interface WithdrawInput {
  authenticated: boolean;
  expenseFound: boolean;
  alreadyDeleted: boolean;
  isAuthor: boolean;
  inSharedFlow: boolean;
  isFullMember: boolean;
  prevStatus: KrugSharedStatus | null;
  clientRequestId: string | null | undefined;
}

export function decideWithdraw(i: WithdrawInput): WithdrawOutcome {
  if (!i.authenticated) return 'unauthenticated';
  if (!i.clientRequestId || i.clientRequestId.length === 0) return 'missing_client_request_id';
  if (!i.expenseFound) return 'not_found';
  if (i.alreadyDeleted) return 'noop_already_in_target_state';
  if (!i.isAuthor) return 'not_author';
  if (!i.inSharedFlow) return 'not_in_shared_flow';
  if (!i.isFullMember) return 'not_full_member';
  if (i.prevStatus !== 'predlozena') return 'wrong_state';
  return 'ok_withdrawn';
}

// ---------- Shared payment source ref ----------

export type SharedSourceRef =
  | { kind: 'custom'; uuid: string }
  | { kind: 'builtin'; slug: string }
  | { kind: 'invalid'; raw: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zrcalo `krug_can_manage_shared_source` parsiranja.
 * `custom:<UUID>` → custom; sve drugo bez `:` ili s nepoznatim prefiksom = builtin slug;
 * `custom:` s neispravnim UUID-om = invalid (SQL helper vraća false).
 */
export function parseSharedSourceRef(raw: string): SharedSourceRef {
  if (raw.startsWith('custom:')) {
    const uuid = raw.slice('custom:'.length);
    if (UUID_RE.test(uuid)) return { kind: 'custom', uuid };
    return { kind: 'invalid', raw };
  }
  if (raw.length === 0) return { kind: 'invalid', raw };
  return { kind: 'builtin', slug: raw };
}

/**
 * Klijent-side guard za `link` akciju — zrcalo SQL pravila:
 *   owner kruga obavezan; za `custom:` izvor i owner izvora obavezan.
 * Built-in slug → samo owner kruga.
 *
 * NIJE zamjena za RLS — samo sprječava nepotreban round-trip kad je očito da
 * će RLS odbiti. Server ostaje izvor istine.
 */
export function canManageSharedSource(
  ref: SharedSourceRef,
  isKrugOwner: boolean,
  isSourceOwner: boolean,
): boolean {
  if (!isKrugOwner) return false;
  if (ref.kind === 'custom') return isSourceOwner;
  if (ref.kind === 'builtin') return true;
  return false;
}
