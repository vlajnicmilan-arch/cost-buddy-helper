/**
 * Modul "Odluke" — Faza 6 (revizija): two-party consent za PONIŠTENJE zatvorenih odluka.
 *
 * Brisanje zatvorenih odluka je UKINUTO (revizija Faze 6). Za greške/testne
 * odluke autor koristi zaseban tok "Povuci prijedlog" (withdraw_decision_proposal),
 * dostupan SAMO dok druga strana još nije poslala nijedan odgovor.
 * Vidjeti canWithdrawProposal() za tu logiku.
 *
 * Ovaj file drži ČISTU logiku (bez DB / UI ovisnosti) koja mirror-a serversku
 * SECURITY DEFINER RPC pravila.
 *
 * Pravila (moraju ostati 1:1 s RPC-om):
 *  - Zahtjev je moguć SAMO za zatvorene odluke (approved/rejected/closed).
 *  - Aktivne (awaiting_response) — akcije nedostupne (rješavaju se ciklusom).
 *  - Jedan aktivan (pending) zahtjev po odluci.
 *  - Predlagatelj NE može sam potvrditi/odbiti svoj zahtjev (samo povući).
 *  - Potvrda mora doći od DRUGE strane odluke.
 *  - Poništenje: ako je odluka bila approved s aneksom → kompenzacijski aneks (−X).
 */

export type DecisionAdminType = 'annul';
export type DecisionAdminStatus = 'pending' | 'confirmed' | 'declined' | 'withdrawn';

export interface DecisionAdminRequest {
  id: string;
  decision_id: string;
  project_id: string;
  type: DecisionAdminType;
  status: DecisionAdminStatus;
  requested_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionAdminContext {
  currentUserId: string;
  ownerUserId: string;
  investorUserId: string | null;
  /** current_status s odluke */
  decisionStatus: 'awaiting_response' | 'approved' | 'rejected' | 'closed';
  /** je li odluka već poništena (annulled_at postavljen) */
  isAnnulled: boolean;
  /** ako postoji, aktivni pending zahtjev za tu odluku */
  pendingRequest: DecisionAdminRequest | null;
}

export interface AvailableAdminActions {
  /** korisnik može predložiti poništenje (nema pending, nije aktivna, stranka je, nije već annulled) */
  canRequestAnnul: boolean;
  /** korisnik može potvrditi/odbiti postojeći pending zahtjev (druga strana) */
  canResolvePending: boolean;
  /** korisnik može povući svoj pending zahtjev (predlagatelj) */
  canWithdrawPending: boolean;
}

const EMPTY: AvailableAdminActions = {
  canRequestAnnul: false,
  canResolvePending: false,
  canWithdrawPending: false,
};

export function isDecisionParty(ctx: {
  currentUserId: string;
  ownerUserId: string;
  investorUserId: string | null;
}): boolean {
  if (!ctx.currentUserId) return false;
  if (ctx.currentUserId === ctx.ownerUserId) return true;
  if (ctx.investorUserId && ctx.currentUserId === ctx.investorUserId) return true;
  return false;
}

export function getAdminActions(ctx: DecisionAdminContext): AvailableAdminActions {
  if (!isDecisionParty(ctx)) return EMPTY;
  if (ctx.decisionStatus === 'awaiting_response') return EMPTY;

  if (ctx.pendingRequest) {
    const isRequester = ctx.pendingRequest.requested_by === ctx.currentUserId;
    return {
      canRequestAnnul: false,
      canResolvePending: !isRequester,
      canWithdrawPending: isRequester,
    };
  }

  return {
    canRequestAnnul: !ctx.isAnnulled,
    canResolvePending: false,
    canWithdrawPending: false,
  };
}

export function canResolveRequest(
  request: DecisionAdminRequest,
  currentUserId: string,
): boolean {
  if (!currentUserId) return false;
  if (request.status !== 'pending') return false;
  if (request.requested_by === currentUserId) return false;
  return true;
}

export function canWithdrawRequest(
  request: DecisionAdminRequest,
  currentUserId: string,
): boolean {
  if (!currentUserId) return false;
  if (request.status !== 'pending') return false;
  return request.requested_by === currentUserId;
}

/**
 * Novčani efekt na projects.contract_value nakon POTVRDE poništenja.
 * Ako odluka nije imala aneks — delta je 0.
 */
export function computeContractDelta(
  originalAmendmentAmount: number | null | undefined,
): number {
  if (originalAmendmentAmount == null) return 0;
  const amt = Number(originalAmendmentAmount) || 0;
  if (amt === 0) return 0;
  return -amt;
}

// ─────────────────────────────────────────────────────────────
// Withdraw proposal (revizija Faze 6)
// ─────────────────────────────────────────────────────────────

export interface WithdrawProposalContext {
  currentUserId: string;
  decisionCreatedBy: string;
  decisionStatus: 'awaiting_response' | 'approved' | 'rejected' | 'closed';
  /** Ukupan broj koraka na odluci; withdraw dopušten samo kad je točno 1 (initial propose). */
  stepsCount: number;
}

/**
 * Server-mirror za withdraw_decision_proposal RPC:
 * autor smije povući vlastiti prijedlog SAMO dok druga strana još nije odgovorila
 * (točno 1 korak = samo initial propose, odluka aktivna).
 */
export function canWithdrawProposal(ctx: WithdrawProposalContext): boolean {
  if (!ctx.currentUserId) return false;
  if (ctx.currentUserId !== ctx.decisionCreatedBy) return false;
  if (ctx.decisionStatus !== 'awaiting_response') return false;
  return ctx.stepsCount === 1;
}
