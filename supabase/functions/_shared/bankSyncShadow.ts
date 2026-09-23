/**
 * SJENA ODLUKE ZA BANKOVNU SINKRONIZACIJU — jezgra gleda, ali NE odlučuje.
 *
 * PROGRAM TEMELJ, KORAK 3, NALOG 2. Sinkronizacija piše servisnim ključem mimo
 * RLS-a, pa se NE prespaja na zajedničku jezgru dok se ne dokaže da bi jezgra
 * odlučila isto. Ovdje jezgra (`moneyLedgerPlan.ts`) trči usporedno i samo se
 * bilježi bi li se složila sa starom odlukom.
 *
 * Pravila:
 *  - Rezultat jezgre se NE KORISTI ni za jedan upis.
 *  - Nijedna metoda ne smije baciti. Ako jezgra pukne, sinkronizacija teče
 *    dalje, a greška se broji i zapiše kao jedan redak dijagnostike.
 *  - Zapis NE SMIJE nositi iznose, opise ni imena druge strane — samo stabilni
 *    id retka, staru odluku, novu odluku i razlog.
 *  - Kandidati dolaze s `user_id` KAKAV PIŠE U BAZI. Jezgra sama izbacuje
 *    kandidate drugog vlasnika; sjena ih ne prepisuje.
 */
import {
  planLedgerRow,
  type LedgerCandidate,
  type LedgerClassification,
  type LedgerDecision,
  type LedgerOutcome,
  type LedgerUserChoice,
} from './moneyLedgerPlan.ts';

/** Najviše toliko neslaganja ide u zapis; ostatak je samo brojka. */
export const SHADOW_MISMATCH_LIMIT = 200;

export interface ShadowRowInput {
  readonly rowIndex: number;
  /** Vlasnik bankovnog računa — obavezan. */
  readonly userId: string;
  readonly stableId: string | null;
  readonly amount: number | null;
  readonly dateIso: string | null;
  readonly direction: 'in' | 'out' | null;
  readonly walletId: string | null;
  /** Odluka koju je stara logika VEĆ donijela za ovaj redak. */
  readonly legacyOutcome: LedgerOutcome;
  readonly classification: LedgerClassification;
  readonly candidates: readonly LedgerCandidate[];
  readonly userChoice?: LedgerUserChoice;
}

export interface ShadowMismatch {
  readonly bank_transaction_id: string | null;
  readonly legacy: LedgerOutcome;
  readonly core: LedgerOutcome;
  readonly reason: string;
}

/** Pravilo „isti trošak" nije spojilo (ambiguous/uncertain) — bez iznosa, opisa, imena. */
export interface SameExpenseUndecided {
  readonly bank_transaction_id: string;
  readonly candidate_ids: readonly string[];
  readonly outcome: 'ambiguous' | 'uncertain';
  readonly reason: string;
}

export interface ShadowOptions {
  readonly sessionId: string;
  readonly userId: string;
  readonly bankAccountId: string;
  /** Samo za testove — zamjena jezgre. */
  readonly plan?: (row: Parameters<typeof planLedgerRow>[0]) => LedgerDecision;
}

/**
 * Skuplja usporedbu stare odluke i jezgre. Ne piše u bazu i ne vraća ništa što
 * bi sinkronizacija smjela upotrijebiti.
 */
export class BankSyncShadow {
  private processed = 0;
  private agreed = 0;
  private disagreed = 0;
  private failed = 0;
  private firstError: string | null = null;
  private readonly mismatches: ShadowMismatch[] = [];
  private undecidedTotal = 0;
  private readonly undecided: SameExpenseUndecided[] = [];
  private readonly plan: (row: Parameters<typeof planLedgerRow>[0]) => LedgerDecision;

  constructor(private readonly opts: ShadowOptions) {
    this.plan = opts.plan ?? planLedgerRow;
  }

  /** Nikad ne baca i nikad ne mijenja ulaz. */
  observe(input: ShadowRowInput): void {
    try {
      this.processed += 1;
      const decision = this.plan({
        rowIndex: input.rowIndex,
        userId: input.userId,
        amount: input.amount ?? 0,
        dateIso: input.dateIso ?? '',
        direction: input.direction,
        walletId: input.walletId,
        fingerprint: input.stableId ?? '',
        classification: input.classification,
        candidates: input.candidates,
        userChoice: input.userChoice ?? {},
      });
      if (decision.outcome === input.legacyOutcome) {
        this.agreed += 1;
        return;
      }
      this.disagreed += 1;
      if (this.mismatches.length < SHADOW_MISMATCH_LIMIT) {
        this.mismatches.push({
          bank_transaction_id: input.stableId,
          legacy: input.legacyOutcome,
          core: decision.outcome,
          reason: decision.reason,
        });
      }
    } catch (err) {
      this.failed += 1;
      if (this.firstError === null) {
        this.firstError = String((err as { message?: string })?.message ?? err);
      }
    }
  }

  /** Nikad ne baca. Najviše SHADOW_MISMATCH_LIMIT zapisa, ostatak samo brojka. */
  noteSameExpenseUndecided(entry: SameExpenseUndecided): void {
    try {
      this.undecidedTotal += 1;
      if (this.undecided.length < SHADOW_MISMATCH_LIMIT) {
        this.undecided.push({
          bank_transaction_id: entry.bank_transaction_id,
          candidate_ids: [...entry.candidate_ids],
          outcome: entry.outcome,
          reason: entry.reason,
        });
      }
    } catch {
      /* dijagnostika ne smije oboriti sync */
    }
  }

  /** Jedan zbirni zapis po pokretanju; `null` kad nije bilo redaka. */
  summaryLog(): Record<string, unknown> | null {
    try {
      if (this.processed === 0 && this.failed === 0 && this.undecidedTotal === 0) return null;
      return {
        event: 'bank_sync_core_shadow',
        session_id: this.opts.sessionId,
        user_id: this.opts.userId,
        severity: this.failed > 0 ? 'warning' : 'info',
        details: {
          bank_account_id: this.opts.bankAccountId,
          processed: this.processed,
          agreed: this.agreed,
          disagreed: this.disagreed,
          core_errors: this.failed,
          core_first_error: this.firstError,
          mismatch_limit: SHADOW_MISMATCH_LIMIT,
          mismatches_logged: this.mismatches.length,
          mismatches: this.mismatches,
          same_expense_undecided_total: this.undecidedTotal,
          same_expense_undecided: this.undecided,
        },
      };
    } catch {
      return null;
    }
  }
}
