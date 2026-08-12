/**
 * Import Review — types shared between GlobalPDFImportHost (producer),
 * ImportReview page (consumer), reducer and sessionStorage draft.
 *
 * IMPORT_FROZEN policy: decisions are stored ONLY (no writes). Execution
 * of merge/insert is Korak 4.
 */

import type { MoneyDirection } from '@/lib/moneyDirection';
import type { DirectionSource } from './transferDirection';

export type QuestionReason = 'merchant_mismatch' | 'no_merchant' | 'ambiguous';

export interface ManualCandidateInfo {
  readonly id: string;
  readonly date: string;
  readonly amount: number;
  readonly type: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
}

export type ClassificationKind =
  | {
      readonly kind: 'auto_merge';
      readonly manualId: string;
      /**
       * `indistinguishable` = par nastao automatskim uparivanjem međusobno
       * nerazlučivih kandidata (isti iznos/novčanik, slična imena). UI ga MORA
       * označiti i ponuditi "Razdvoji". Nedostatak = 'merchant' (staro).
       */
      readonly origin?: 'merchant' | 'indistinguishable';
    }

  | { readonly kind: 'question'; readonly reason: QuestionReason; readonly candidateIds: readonly string[] }
  | { readonly kind: 'new'; readonly existsByFingerprint: boolean }
  /**
   * Rule engine matched this row against a learned transfer rule. Executor will
   * insert as `type='transfer'` with income_source_id = targetIncomeSourceId.
   * Balance updater/DB trigger handles both sides of the transfer.
   */
  | {
      readonly kind: 'transfer';
      readonly targetIncomeSourceId: string;
      readonly ruleId: string | null;
      /**
       * Smjer novca u odnosu na novčanik izvoda ('in' = novac ulazi u njega).
       * `null` = nije ga moguće izvesti ni iz predznaka ni iz opisa →
       * ImportReview MORA pitati korisnika, izvršenje je blokirano.
       */
      readonly direction: MoneyDirection | null;
      /**
       * Odakle prijenos dolazi: `rule` = pogodak naučenog pravila iz
       * `import_transfer_rules`, `keyword` = deterministički safety-net iz
       * opisa (pdfPostProcess). Bedž "Iz pravila" smije se prikazati SAMO za
       * `rule` — inače laže.
       */
      readonly origin: 'rule' | 'keyword';
      /** Odakle je smjer izveden — `amount` znači "piše na izvodu". */
      readonly directionSource: DirectionSource;
      /** Opis se kosio s predznakom; predznak je pobijedio. */
      readonly directionConflict: boolean;
    };

export interface ImportReviewRow {
  readonly index: number;
  readonly date: string;
  readonly amount: number;
  readonly type: string;
  readonly merchantName?: string | null;
  readonly description?: string | null;
  readonly fingerprint?: string | null;
  readonly classification: ClassificationKind;
  /**
   * PONUDA SPAJANJA (kartično kašnjenje) — id ručnog/skeniranog unosa koji je
   * prošao sve četiri ograde iz `lateCardMatch.ts`. Samo PONUDA: zadano stanje
   * je razdvojeno, spaja se isključivo korisnikovim dodirom.
   */
  readonly lateMatchOffer?: string | null;
}

/**
 * Full data required by the Korak 4 executor to INSERT a row into expenses.
 * Kept serializable (no Date objects) so it survives sessionStorage.
 */
export interface SerializedImportedTx {
  readonly index: number;
  readonly dateIso: string;
  readonly amount: number;
  readonly type: string;
  readonly category: string;
  readonly description: string;
  readonly merchantName: string | null;
  readonly paymentSource: string; // canonical `custom:<uuid>` or 'cash'/'other'
  readonly balanceAfter: number | null;
  /**
   * Zero-based position of this row inside its source bank statement (parser
   * output order). Persisted onto `expenses.bank_row_seq` so the wallet list
   * can preserve bank order for same-day rows.
   */
  readonly bankRowSeq: number | null;
  /**
   * DOSLOVAN redak s izvoda (citat). NIKAD ne ulazi u `computeImportFingerprint`
   * — inače bi pao dedup nad već uvezenim redcima.
   */
  readonly bankRawLine?: string | null;
  /** Porijeklo citata: 'text' (PDF sloj), 'html' (tablica), 'ai' (prepis čitačem). */
  readonly bankRawLineSource?: 'text' | 'html' | 'ai' | null;
  readonly fingerprint: string;
}

/**
 * Wallet the user can pick as the DESTINATION of a transfer classified from a
 * bank row (goes into `expenses.income_source_id`). Excludes the source
 * wallet itself — you can't transfer to the same wallet you're transferring
 * from.
 */
export interface TransferTargetOption {
  readonly id: string;               // raw UUID (matches income_source_id)
  readonly name: string;
  readonly key: string;              // canonical resolvePaymentSourceKey (e.g. `custom:<uuid>`)
  readonly icon?: string | null;
}

export interface ImportReviewPayload {
  readonly jobId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly createdAt: number;
  readonly rows: readonly ImportReviewRow[];
  readonly manualCandidates: Readonly<Record<string, ManualCandidateInfo>>;
  /** Full imported transaction data keyed by row.index (Korak 4 executor input). */
  readonly importedTransactions: readonly SerializedImportedTx[];
  /** Stable batch id — persisted so idempotent retry reuses it. */
  readonly batchId: string;
  /** Wallets the user can pick as transfer destinations. */
  readonly availableTargets: readonly TransferTargetOption[];
  /**
   * Metapodaci uvezene datoteke. Zapisuju se u `imported_statements` tek nakon
   * commita (tada postoji batch). Bez toga nema zaštite od dvostrukog uvoza
   * iste datoteke ni "Nastavi" bannera nakon zatvaranja dijaloga.
   */
  readonly statement?: {
    readonly fileHash: string | null;
    readonly contentHash: string | null;
    readonly fileName: string | null;
    readonly fileSize: number | null;
    readonly mimeType: string | null;
  };
  /**
   * Završni saldo ISPISAN NA SAMOM IZVODU (mail ekstrakcija, `detectClosingBalance`).
   * Jedina bankovna istina za izvore bez Open Bankinga (nema retka u `bank_accounts`).
   * Koristi se SAMO kad `has_bank_row = false` — bankovni redak uvijek ima prednost.
   */
  readonly statementClosingBalance?: number | null;
  /** Datum (ISO) na koji taj saldo vrijedi — kraj razdoblja izvoda. */
  readonly statementDate?: string | null;
}


export type QuestionAnswer = { choice: 'merge'; manualId: string } | { choice: 'new' };

/**
 * Per-row transfer decision — either rule-suggested (row.classification.kind
 * === 'transfer') or user-flagged from a `new` row via "Označi kao prijenos".
 * If present AND enabled, executor writes a single `type='transfer'` row with
 * income_source_id = targetIncomeSourceId. rememberRule controls whether a new
 * rule (or refresh of existing) is upserted BEFORE the insert.
 */
export interface TransferDecision {
  readonly enabled: boolean;
  /**
   * Druga strana prijenosa (UUID korisnikovog novčanika). NIKAD se ne upisuje
   * slijepo u `income_source_id` — par slaže `buildTransferPair()` po smjeru.
   */
  readonly targetIncomeSourceId: string;
  /** Smjer novca u odnosu na novčanik izvoda; `null` = neodgovoreno pitanje. */
  readonly direction: MoneyDirection | null;
  readonly rememberRule: boolean;
  /** Merchant key normalized at time of decision (used for rule upsert). */
  readonly merchantKey: string | null;
  /** Source wallet key normalized at time of decision (used for rule upsert). */
  readonly sourceWalletKey: string | null;
}

export interface ImportReviewDecisions {
  readonly autoMerge: Readonly<Record<number, boolean>>;
  readonly questions: Readonly<Record<number, QuestionAnswer | null>>;
  readonly newRows: Readonly<Record<number, boolean>>;
  readonly transfers: Readonly<Record<number, TransferDecision | null>>;
  /**
   * OZNAKA "BEZ OBJAŠNJENJA" po retku ("Ne znam još što je ovo"). Isključivo
   * korisnikova kvačica — nema nijednog puta koji je pali sam. Ne mijenja
   * ništa u upisu, saldu ni fingerprintu; samo popuni
   * `expenses.needs_explanation`. Opcionalno zbog starih nacrta iz
   * sessionStoragea.
   */
  readonly needsExplanation?: Readonly<Record<number, boolean>>;
}

export interface ImportReviewDraft {
  readonly jobId: string;
  readonly savedAt: number;
  readonly decisions: ImportReviewDecisions;
  readonly scrollY?: number;
}

/** Draft TTL — pause/resume, fone poziv usred pregleda; 30 min. */
export const IMPORT_REVIEW_DRAFT_TTL_MS = 30 * 60 * 1000;

export const IMPORT_REVIEW_PAYLOAD_KEY = 'vmb-import-review-payload:v1';
export const IMPORT_REVIEW_DRAFT_KEY = 'vmb-import-review-draft:v1';
