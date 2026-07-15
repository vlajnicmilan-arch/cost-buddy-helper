/**
 * Modul "Odluke" — Faza 6: two-party consent za poništenje/brisanje ZATVORENIH odluka.
 *
 * Ovaj file drži ČISTU logiku (bez DB / UI ovisnosti) koja mirror-a serversku
 * SECURITY DEFINER RPC pravila. Koristi se u UI-u za odluku koje gumbe prikazati
 * te u unit testovima kao regresijska mreža.
 *
 * Pravila (moraju ostati 1:1 s RPC-om):
 *  - Zahtjev je moguć SAMO za zatvorene odluke (approved/rejected/closed).
 *  - Aktivne (awaiting_response) — akcije nedostupne (rješavaju se ciklusom).
 *  - Jedan aktivan (pending) zahtjev po odluci.
 *  - Predlagatelj NE može sam potvrditi/odbiti svoj zahtjev (samo povući).
 *  - Potvrda mora doći od DRUGE strane odluke.
 *  - Poništenje: ako je odluka bila approved s aneksom → kompenzacijski aneks (−X).
 *  - Brisanje: ako je odluka imala aneks → aneks se briše i Ugovoreno se vraća (−X).
 */

export type DecisionAdminType = 'annul' | 'delete';
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
  /** korisnik može predložiti poništenje ili brisanje (nema pending, nije aktivna, stranka je) */
  canRequestAnnul: boolean;
  canRequestDelete: boolean;
  /** korisnik može potvrditi/odbiti postojeći pending zahtjev (druga strana) */
  canResolvePending: boolean;
  /** korisnik može povući svoj pending zahtjev (predlagatelj) */
  canWithdrawPending: boolean;
}

const EMPTY: AvailableAdminActions = {
  canRequestAnnul: false,
  canRequestDelete: false,
  canResolvePending: false,
  canWithdrawPending: false,
};

/**
 * Je li korisnik jedna od dviju stranaka odluke (vlasnik ili investitor)?
 */
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

/**
 * Vraća skup dostupnih admin akcija (predloži/potvrdi/odbij/povuci) za trenutnog
 * korisnika i stanje odluke + eventualni pending zahtjev.
 */
export function getAdminActions(ctx: DecisionAdminContext): AvailableAdminActions {
  if (!isDecisionParty(ctx)) return EMPTY;

  // Aktivne odluke — nema admin akcija (rješavaju se kroz ciklus)
  if (ctx.decisionStatus === 'awaiting_response') return EMPTY;

  if (ctx.pendingRequest) {
    const isRequester = ctx.pendingRequest.requested_by === ctx.currentUserId;
    return {
      canRequestAnnul: false,
      canRequestDelete: false,
      canResolvePending: !isRequester,
      canWithdrawPending: isRequester,
    };
  }

  return {
    canRequestAnnul: !ctx.isAnnulled,
    canRequestDelete: true,
    canResolvePending: false,
    canWithdrawPending: false,
  };
}

/**
 * Server-mirror: smije li korisnik razriješiti (potvrditi/odbiti) zahtjev?
 * Predlagatelj NE smije razriješiti svoj zahtjev.
 */
export function canResolveRequest(
  request: DecisionAdminRequest,
  currentUserId: string,
): boolean {
  if (!currentUserId) return false;
  if (request.status !== 'pending') return false;
  if (request.requested_by === currentUserId) return false;
  return true;
}

/**
 * Server-mirror: smije li korisnik povući vlastiti zahtjev?
 */
export function canWithdrawRequest(
  request: DecisionAdminRequest,
  currentUserId: string,
): boolean {
  if (!currentUserId) return false;
  if (request.status !== 'pending') return false;
  return request.requested_by === currentUserId;
}

/**
 * Server-mirror: novčani efekt na projects.contract_value nakon POTVRDE zahtjeva.
 *  - annul  → kompenzacijski aneks (delta = −original)
 *  - delete → izvorni aneks se briše (delta = −original)
 * Ako odluka nije imala aneks — delta je 0.
 */
export function computeContractDelta(
  requestType: DecisionAdminType,
  originalAmendmentAmount: number | null | undefined,
): number {
  if (originalAmendmentAmount == null) return 0;
  const amt = Number(originalAmendmentAmount) || 0;
  if (amt === 0) return 0;
  // Oba tipa vraćaju Ugovoreno u početno stanje (−original).
  // annul: kompenzacija (novi aneks −X); delete: uklanjanje aneksa (−X na baseline).
  // Razlika je u tragu (annul čuva povijest), ne u iznosu delte.
  void requestType;
  return -amt;
}
