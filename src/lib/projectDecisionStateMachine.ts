/**
 * Modul "Odluke" — čista logika stroja stanja (mirror DB trigger-a
 * `project_decision_step_enforce`). Ovaj modul se koristi u UI-u za:
 *  - određivanje koje akcije su legalne u sljedećem koraku,
 *  - prikaz badge-a i naslova ("Čeka odgovor", "Imaš još 1 korekciju",
 *    "Konačna odluka — samo prihvati ili odbij"),
 *  - unit test pokrivenost strogog ciklusa neovisno o bazi.
 *
 * DB trigger je autoritativni; ovaj file MORA ostati 1:1 s njim.
 */

export type DecisionStatus = 'awaiting_response' | 'approved' | 'rejected' | 'closed';
export type DecisionClosedReason = 'accepted' | 'rejected' | 'cycle_exhausted' | null;
export type DecisionAction = 'propose' | 'counter' | 'correction' | 'accept' | 'reject';
export type DecisionActorRole = 'owner' | 'investor';

export interface DecisionStep {
  step_no: number;
  actor_user_id: string;
  actor_role: DecisionActorRole;
  action: DecisionAction;
  message?: string | null;
  /** Faza 2 — cijena ponuđena u koraku (null ako korak ne mijenja cijenu). */
  price?: number | null;
  created_at?: string;
}

/**
 * Faza 2 — "zadnja ponuđena cijena": najviši step_no s ne-null cijenom.
 * accept/reject NIKAD ne nose cijenu (blokira DB trigger); ova funkcija
 * pretpostavlja istu invariantu i za UI ekvivalentnost.
 */
export function resolveEffectiveDecisionPrice(steps: DecisionStep[]): number | null {
  const sorted = [...steps].sort((a, b) => b.step_no - a.step_no);
  for (const s of sorted) {
    if (s.price != null && s.price !== 0) return Number(s.price);
  }
  return null;
}

export interface DecisionCore {
  id: string;
  created_by: string;
  current_status: DecisionStatus;
  closed_reason?: DecisionClosedReason;
}

export interface NextStepContext {
  /** Trenutni korisnik. */
  currentUserId: string;
  /** UUID vlasnika projekta. */
  ownerUserId: string;
  /** UUID investitora projekta (može biti null ako investitor nije dodijeljen). */
  investorUserId: string | null;
}

export interface LegalActions {
  canAccept: boolean;
  canReject: boolean;
  canCounter: boolean;
  canCorrect: boolean;
  /** Ako true — UI mora prikazati "Konačna odluka: samo prihvati ili odbij". */
  isFinalRound: boolean;
  /** Ako true — pošiljatelj ima još TOČNO jednu korekciju (nakon counter-a). */
  hasOneCorrectionLeft: boolean;
  /** Ako true — odluka je zatvorena i nema više akcija. */
  isClosed: boolean;
  /** Tko je "druga strana" u odnosu na zadnji korak (za info). */
  awaitingUserId: string | null;
}

const EMPTY: LegalActions = {
  canAccept: false, canReject: false, canCounter: false, canCorrect: false,
  isFinalRound: false, hasOneCorrectionLeft: false, isClosed: false, awaitingUserId: null,
};

/**
 * Vraća dostupne akcije za trenutnog korisnika na temelju povijesti koraka.
 * Ista pravila kao DB trigger.
 */
export function getLegalActions(
  decision: DecisionCore,
  steps: DecisionStep[],
  ctx: NextStepContext,
): LegalActions {
  if (decision.current_status !== 'awaiting_response') {
    return { ...EMPTY, isClosed: true };
  }
  const sorted = [...steps].sort((a, b) => a.step_no - b.step_no);
  const last = sorted[sorted.length - 1] ?? null;
  const nextStep = (last?.step_no ?? 0) + 1;

  // Prvi korak: mora ga poslati created_by
  if (!last) {
    return EMPTY; // Prvi propose ide kroz zaseban "Novi prijedlog" tijek, ne kroz akcijske gumbe
  }

  const otherParty = last.actor_user_id === ctx.ownerUserId
    ? ctx.investorUserId
    : ctx.ownerUserId;

  const iAmOtherParty = ctx.currentUserId === otherParty;
  const iAmOriginalProposer = ctx.currentUserId === decision.created_by;

  // Korak 2: odgovor na propose (druga strana)
  if (nextStep === 2 && last.action === 'propose' && iAmOtherParty) {
    return { ...EMPTY, canAccept: true, canReject: true, canCounter: true, awaitingUserId: ctx.currentUserId };
  }

  // Korak 3: korekcija (originalni predlagač, nakon counter-a) — JOŠ 1 korekcija
  if (nextStep === 3 && last.action === 'counter' && iAmOriginalProposer) {
    return { ...EMPTY, canCorrect: true, hasOneCorrectionLeft: true, awaitingUserId: ctx.currentUserId };
  }

  // Korak 4: konačna odluka (druga strana, nakon correction) — samo accept/reject
  if (nextStep === 4 && last.action === 'correction' && iAmOtherParty) {
    return { ...EMPTY, canAccept: true, canReject: true, isFinalRound: true, awaitingUserId: ctx.currentUserId };
  }

  // Trenutni korisnik nije na potezu
  return { ...EMPTY, awaitingUserId: otherParty };
}

/**
 * Predviđa novi status odluke nakon primjene akcije (za optimistic update / testove).
 */
export function nextStatusAfter(action: DecisionAction): {
  status: DecisionStatus;
  closed_reason: DecisionClosedReason;
} {
  switch (action) {
    case 'accept': return { status: 'approved', closed_reason: 'accepted' };
    case 'reject': return { status: 'rejected', closed_reason: 'rejected' };
    default:       return { status: 'awaiting_response', closed_reason: null };
  }
}

/**
 * Vraća prevodivi ključ za tekstualnu oznaku faze na kartici odluke.
 */
export function decisionPhaseKey(
  decision: DecisionCore,
  steps: DecisionStep[],
): 'awaiting' | 'has_one_correction' | 'final_round' | 'approved' | 'rejected' | 'closed' {
  if (decision.current_status === 'approved') return 'approved';
  if (decision.current_status === 'rejected') return 'rejected';
  if (decision.current_status === 'closed') return 'closed';
  const sorted = [...steps].sort((a, b) => a.step_no - b.step_no);
  const last = sorted[sorted.length - 1];
  if (!last) return 'awaiting';
  if (last.action === 'counter') return 'has_one_correction';
  if (last.action === 'correction') return 'final_round';
  return 'awaiting';
}
