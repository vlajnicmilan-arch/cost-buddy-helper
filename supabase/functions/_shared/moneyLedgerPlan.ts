/**
 * JEZGRA ODLUKE O RETKU NOVCA — Deno zrcalo `src/lib/moneyLedgerPlan.ts`.
 *
 * NE mijenjaj ovu datoteku ručno bez iste izmjene u `src/lib/moneyLedgerPlan.ts`:
 * jezgra između SHARED CORE markera mora biti znak po znak ista, a to čuva
 * `src/lib/__tests__/moneyLedgerPlanMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------

/** Zatvoren popis ishoda. Ništa izvan ovoga nije valjana odluka. */
export type LedgerOutcome =
  | 'new'
  | 'merge'
  | 'pair'
  | 'transfer'
  | 'restore'
  | 'needs_review';

/** Zašto je ishod takav kakav jest — za dijagnostiku i za brojače. */
export type LedgerReason =
  /** Korisnik je sam odabrao s kojim postojećim prijenosom se spaja. */
  | 'pair_user_choice'
  /** Druga strana prijenosa je već u knjigama i korisnik je nije razdvojio. */
  | 'pair_auto'
  /** Korisnik je potvrdio prijenos (pravilo, kartica, ime ili ručni odabir). */
  | 'transfer_confirmed'
  /** Korisnik je poništio prijenos → redak ide kao običan prihod/rashod. */
  | 'transfer_rejected'
  /** Automatski uparen s ručnim unosom i korisnik je kvačicu ostavio. */
  | 'auto_merge_confirmed'
  /** „Razdvoji" na automatski uparenom retku → uvozi se kao novi redak. */
  | 'auto_merge_split'
  /** Odgovor na pitanje: spoji s odabranim ručnim unosom. */
  | 'question_merge'
  /** Odgovor na pitanje: ovo je novi redak. */
  | 'question_new'
  /** Ponuda spajanja (kartično kašnjenje) koju je korisnik prihvatio. */
  | 'late_offer_merge'
  /** Novi redak koji je korisnik potvrdio. */
  | 'new_confirmed'
  /** Otisak već pripada ŽIVOM retku u knjigama. */
  | 'fingerprint_live'
  /** Otisak pripada ranije obrisanom retku, bez korisnikove radnje. */
  | 'previously_deleted'
  /** Korisnik je svjesno vratio ranije obrisani redak u knjige. */
  | 'restore_confirmed'
  /** Korisnik nije potvrdio redak (nema kvačice ni odgovora). */
  | 'skipped_by_user';

/** Postojeći redak u knjigama koji MOŽE biti odgovor na ovaj redak. */
export interface LedgerCandidate {
  readonly id: string;
  /** Vlasnik kandidata — mora biti isti kao vlasnik retka. */
  readonly userId: string;
  /**
   * `manual` = ručni/skenirani unos, `pair` = ponuđeni kandidat za par koji
   * korisnik SMIJE odabrati, `pair_default` = automatski nađena druga strana
   * (nije na popisu za odabir).
   */
  readonly kind: 'manual' | 'pair' | 'pair_default';
}

/** Kako je redak razvrstan prije korisnikove odluke. */
export type LedgerClassification =
  | { readonly kind: 'auto_merge'; readonly manualId: string }
  | { readonly kind: 'question' }
  | {
      readonly kind: 'new';
      /** Otisak zauzet živim retkom. */
      readonly existsByFingerprint: boolean;
      /** Otisak zauzet ranije obrisanim retkom. */
      readonly deletedByFingerprint: boolean;
    }
  | {
      readonly kind: 'transfer';
      /** Druga strana prijenosa koja već stoji u knjigama. */
      readonly pairedExistingId: string | null;
    };

/** Sve što je korisnik rekao o ovom retku. */
export interface LedgerUserChoice {
  /** Odabrani kandidat kod dvosmislenog uparivanja ('none' = nijedan). */
  readonly pairChoiceId?: string | null;
  /** „Ovo je drugi prijenos" — razdvaja automatski uparen prijenos. */
  readonly unpair?: boolean;
  /** Potvrđen (true) ili poništen (false) prijenos; undefined = bez odluke. */
  readonly transferEnabled?: boolean;
  /** Kvačica na automatski uparenom retku. */
  readonly autoMergeOn?: boolean;
  /** Odgovor na pitanje ili na ponudu spajanja. */
  readonly questionChoice?: 'merge' | 'new';
  /** Ručni unos s kojim se spaja kod `questionChoice === 'merge'`. */
  readonly questionManualId?: string | null;
  /** Kvačica „uvezi kao novi redak". */
  readonly newRowOn?: boolean;
  /** „Vrati u knjige" na ranije obrisanom otisku. */
  readonly restoreDeleted?: boolean;
}

/** Normalizirani redak novca — isti oblik za uvoz i za sinkronizaciju. */
export interface LedgerRowInput {
  readonly rowIndex: number;
  /** OBAVEZNO — vlasnik retka. */
  readonly userId: string;
  readonly amount: number;
  readonly dateIso: string;
  readonly direction: 'in' | 'out' | null;
  /** UUID novčanika s čijeg izvoda redak dolazi. */
  readonly walletId: string | null;
  readonly fingerprint: string;
  readonly classification: LedgerClassification;
  readonly candidates: readonly LedgerCandidate[];
  readonly userChoice: LedgerUserChoice;
}

export interface LedgerDecision {
  readonly rowIndex: number;
  readonly outcome: LedgerOutcome;
  readonly reason: LedgerReason;
  /** Postojeći redak s kojim se spaja/upara — uvijek istog vlasnika. */
  readonly candidateId: string | null;
}

export class LedgerPlanOwnerError extends Error {
  constructor() {
    super('money_ledger_plan_missing_user');
    this.name = 'LedgerPlanOwnerError';
  }
}

const ownedById = (row: LedgerRowInput): Map<string, LedgerCandidate> => {
  const map = new Map<string, LedgerCandidate>();
  for (const candidate of row.candidates) {
    if (candidate.userId !== row.userId) continue;
    map.set(candidate.id, candidate);
  }
  return map;
};

/** Id koji pripada DRUGOM vlasniku — za ovaj redak ne postoji. */
const foreignIds = (row: LedgerRowInput): Set<string> => {
  const set = new Set<string>();
  for (const candidate of row.candidates) {
    if (candidate.userId !== row.userId) set.add(candidate.id);
  }
  return set;
};

const decide = (
  row: LedgerRowInput,
  outcome: LedgerOutcome,
  reason: LedgerReason,
  candidateId: string | null = null,
): LedgerDecision => ({ rowIndex: row.rowIndex, outcome, reason, candidateId });

/**
 * Jedna odluka za jedan redak. Redoslijed grana je isti kao u uvozu:
 * par → prijenos → automatsko spajanje → pitanje → novi redak.
 */
export function planLedgerRow(row: LedgerRowInput): LedgerDecision {
  if (typeof row.userId !== 'string' || row.userId.length === 0) {
    throw new LedgerPlanOwnerError();
  }

  const owned = ownedById(row);
  const foreign = foreignIds(row);
  const cls = row.classification;
  const choice = row.userChoice;

  // 1) PAR — druga strana prijenosa već stoji u knjigama.
  if (cls.kind === 'transfer') {
    const picked = choice.pairChoiceId;
    if (typeof picked === 'string' && picked.length > 0 && picked !== 'none') {
      const candidate = owned.get(picked);
      if (candidate && candidate.kind === 'pair') {
        return decide(row, 'pair', 'pair_user_choice', candidate.id);
      }
    }
    if (
      typeof cls.pairedExistingId === 'string' &&
      cls.pairedExistingId.length > 0 &&
      choice.unpair !== true &&
      !foreign.has(cls.pairedExistingId)
    ) {
      return decide(row, 'pair', 'pair_auto', cls.pairedExistingId);
    }
  }

  // 2) PRIJENOS — korisnikova potvrda nadjačava razvrstavanje retka.
  if (choice.transferEnabled === true) {
    return decide(row, 'transfer', 'transfer_confirmed');
  }

  // 3) AUTOMATSKO SPAJANJE s ručnim unosom.
  if (cls.kind === 'auto_merge') {
    if (choice.autoMergeOn === true && !foreign.has(cls.manualId)) {
      return decide(row, 'merge', 'auto_merge_confirmed', cls.manualId);
    }
    if (choice.autoMergeOn !== true && choice.newRowOn === true) {
      return decide(row, 'new', 'auto_merge_split');
    }
    return decide(row, 'needs_review', 'skipped_by_user');
  }

  // 4) PITANJE — bez odgovora se ništa ne piše.
  if (cls.kind === 'question') {
    if (choice.questionChoice === 'merge') {
      const manualId = choice.questionManualId ?? null;
      if (manualId && !foreign.has(manualId)) {
        return decide(row, 'merge', 'question_merge', manualId);
      }
      return decide(row, 'needs_review', 'skipped_by_user');
    }
    if (choice.questionChoice === 'new') {
      return decide(row, 'new', 'question_new');
    }
    return decide(row, 'needs_review', 'skipped_by_user');

  }

  // 5) NOVI REDAK — otisak odlučuje prije korisnika.
  if (cls.kind === 'new') {
    if (cls.existsByFingerprint) {
      return decide(row, 'needs_review', 'fingerprint_live');
    }
    if (cls.deletedByFingerprint) {
      if (choice.restoreDeleted === true) {
        return decide(row, 'restore', 'restore_confirmed');
      }
      return decide(row, 'needs_review', 'previously_deleted');
    }
    if (choice.questionChoice === 'merge') {
      const manualId = choice.questionManualId ?? null;
      if (manualId && !foreign.has(manualId)) {
        return decide(row, 'merge', 'late_offer_merge', manualId);
      }
    }
    if (choice.newRowOn === true) {
      return decide(row, 'new', 'new_confirmed');
    }
    return decide(row, 'needs_review', 'skipped_by_user');
  }

  // 6) Prijenos koji je korisnik poništio vraća se u običan prihod/rashod.
  if (cls.kind === 'transfer' && choice.transferEnabled === false) {
    return decide(row, 'new', 'transfer_rejected');
  }

  return decide(row, 'needs_review', 'skipped_by_user');
}

/** Isti redoslijed redaka kao na ulazu — brane se oslanjaju na to. */
export function planLedgerRows(
  rows: readonly LedgerRowInput[],
): readonly LedgerDecision[] {
  return rows.map(planLedgerRow);
}

// ---------------- SHARED CORE END ----------------
