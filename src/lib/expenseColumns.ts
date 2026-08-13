/**
 * JEFTIN MEĐUKORAK ZA DOHVAT TRANSAKCIJA — eksplicitna lista stupaca.
 *
 * `useExpenseFetch` je do sada povlačio `select('*')` kroz cijelu povijest
 * (stranice po 1000). Teška tekstualna polja koja lista nikad ne prikazuje
 * (doslovan bankovni redak, lokacija, razlozi odbijanja) nepotrebno su
 * napuhavala payload. Ovdje je JEDINI izvor istine o tome što lista dohvaća.
 *
 * ŽELJEZNO PRAVILO: bolje stupac viška nego runtime `undefined` koji tiho
 * slomi zbroj ili saldo. Stupac se smije izbaciti tek kad je dokazano da ga
 * NIJEDAN potrošač `useExpenses` skupa ne čita.
 *
 * Isključeni stupci i dokaz (grep po `src/`, izuzev generiranih
 * `integrations/supabase/types.ts` i i18n kataloga):
 *  - bank_raw_line, bank_raw_line_source → čita ISKLJUČIVO
 *    `TransactionDetailDialog` (citat "Kako piše na izvodu") → lazy po id-u.
 *  - location_name → čita ISKLJUČIVO `TransactionDetailDialog` → lazy po id-u.
 *  - location_coords → nigdje se ne čita s expense retka (samo upis).
 *  - rejection_reason → čita se samo iz `useProjectPendingTransactions`
 *    (vlastiti upit), ne iz liste.
 *  - krug_reject_reason → čita se samo iz `KrugTransactionPanel` /
 *    `KrugDecidedSection` (vlastiti upiti).
 *  - reviewed_at, reviewed_by, deleted_by, client_request_id → nigdje se ne
 *    čitaju s expense retka (samo upis / server logika).
 */

/** Stupci koje lista (i svi potrošači `useExpenses`) dohvaćaju. */
export const EXPENSE_LIST_COLUMNS = [
  'id',
  'user_id',
  'amount',
  'description',
  'category',
  'type',
  'date',
  'receipt_url',
  'merchant_name',
  'ai_extracted',
  'created_at',
  'updated_at',
  'payment_source',
  'income_source_id',
  'status',
  'submitted_by',
  'payment_source_card_id',
  'note',
  'project_id',
  'milestone_id',
  'budget_id',
  'expense_nature',
  'import_batch_id',
  'business_profile_id',
  'vat_rate',
  'vat_amount',
  'cash_register_id',
  'currency',
  'work_type',
  'bank_transaction_id',
  'bank_account_id',
  'collaborator_id',
  'is_advance',
  'linked_advance_ids',
  'deleted_at',
  'bank_match_status',
  'possible_duplicate_of',
  'krug_id',
  'krug_privacy',
  'krug_shared_status',
  'recurring_transaction_id',
  'event_at',
  'time_confidence',
  'user_edited_event_at',
  'worker_payout_id',
  'worker_payout_batch_id',
  'balance_after',
  'bank_row_seq',
  'category_origin',
  'invoice_id',
  'needs_explanation',
  'owner_funding_choice',
] as const;

/** Teška polja koja se dohvaćaju tek u detalju transakcije, po id-u. */
export const EXPENSE_DETAIL_LAZY_COLUMNS = [
  'bank_raw_line',
  'bank_raw_line_source',
  'location_name',
] as const;

/**
 * Namjerno isključeni stupci — dokumentirani da test može tvrditi da lista +
 * lazy + isključeni čine cijelu tablicu.
 */
export const EXPENSE_OMITTED_COLUMNS = [
  'location_coords',
  'rejection_reason',
  'krug_reject_reason',
  'reviewed_at',
  'reviewed_by',
  'deleted_by',
  'client_request_id',
] as const;

/**
 * PostgREST select string. Tipiran kao `string` namjerno — supabase-js parsira
 * literal select stringove na razini tipova, što na ovakvoj listi ubija tsgo.
 */
export const EXPENSE_LIST_SELECT: string = EXPENSE_LIST_COLUMNS.join(', ');

export const EXPENSE_DETAIL_LAZY_SELECT: string = ['id', ...EXPENSE_DETAIL_LAZY_COLUMNS].join(', ');
