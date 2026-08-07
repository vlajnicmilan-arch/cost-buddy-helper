/**
 * MONEY DIRECTION — jedini izvor istine za smjer novca kod transakcija koje
 * nastaju iz VANJSKIH podataka (uvoz izvoda, bankovna sinkronizacija, pravila).
 *
 * Problem koji rješava: prije ovog modula svaki put uvoza je sam tumačio smjer
 * (opis retka u uvozu izvoda, `credit_debit_indicator` u sinkronizaciji), pa su
 * nadoplate završavale kao odljev, a kupnje kao priljev.
 *
 * Semantika baze (NE mijenja se):
 *   expenses.payment_source    → izvor KOJI PLAĆA (odljev, -amount)
 *   expenses.income_source_id  → izvor KOJI PRIMA (priljev, +amount)
 *
 * Smjer je uvijek relativan na novčanik čiji se izvod/sinkronizacija obrađuje:
 *   'in'  → novac ULAZI u taj novčanik
 *   'out' → novac IZLAZI iz tog novčanika
 *
 * Zrcalo za edge funkcije: `supabase/functions/_shared/moneyDirection.ts`.
 * Jezgra između SHARED CORE markera mora biti identična u obje datoteke —
 * čuva ju `moneyDirectionMirror.test.ts`.
 */

// ---------------- SHARED CORE START ----------------
export type MoneyDirection = 'in' | 'out';

/** Koliko je pouzdana odluka o smjeru. `low` = pogodak zadnje instance. */
export type DirectionConfidence = 'high' | 'medium' | 'low';

export interface TransferClassification {
  /** Je li redak uopće interni prijenos između korisnikovih izvora. */
  readonly isTransfer: boolean;
  /** Smjer izveden iz opisa; `null` = nejasno, mora pitati korisnika. */
  readonly direction: MoneyDirection | null;
  readonly confidence: DirectionConfidence;
}

/**
 * Ključne riječi koje redak proglašavaju internim prijenosom.
 * Preseljeno iz `csvParsers.isInternalTransfer` — tamo je ostao samo wrapper.
 */
export const TRANSFER_KEYWORDS: readonly string[] = [
    // Aircash transfers
    'uplata na aircash',
    'nadoplata aircash',
    'aircash top up',
    'top up aircash',
    'aircash nadoplata',
    // Revolut transfers
    'revolut top up',
    'revolut nadoplata',
    'top-up',
    'topup',
    'uplata revolut',
    'nadoplata revolut',
    'added money',
    'money added',
    // General bank transfers
    'prijenos na vlastiti',
    'prijenos između računa',
    'prijenos s računa',
    'prijenos na račun',
    'transfer between accounts',
    'internal transfer',
    'interni prijenos',
    'prebacivanje sredstava',
    'transfer to own',
    'transfer from own',
    'own account transfer',
    'vlastiti račun',
    // Croatian bank specific
    'pbz prijenos',
    'erste prijenos',
    'zaba prijenos',
    'otp prijenos',
    'rba prijenos',
    'raiffeisen prijenos',
    'addiko prijenos',
    'hpb prijenos',
    'sberbank prijenos',
    // Card top-ups
    'visa top up',
    'mastercard top up',
    'maestro top up',
    'card top up',
    'kartica nadoplata',
    'nadoplata kartice',
    'dopuna kartice',
    // ATM and cash operations
    'podizanje gotovine',
    'bankomat podizanje',
    'atm withdrawal',
    'atm',
    'bankomat',
    'cash withdrawal',
    'polog gotovine',
    'cash deposit',
    'uplata gotovine',
    // Crypto transfers between wallets
    'transfer to wallet',
    'prijenos na wallet',
    'crypto transfer',
    'wallet transfer',
    // Exchange operations
    'exchange',
    'mjenjačnica',
    'currency exchange',
    'forex',
    'konverzija valute',
    'currency conversion',
    // Specific patterns
    'nadoplata putem',
    'savings transfer',
    'štednja prijenos',
    'oročena sredstva',
    'tekući račun prijenos',
    // PayPal and digital wallets
    'paypal transfer',
    'paypal prijenos',
    'wise transfer',
    'skrill transfer',
    'n26 transfer',
    // Loan/credit related transfers
    'otplata kredita',
    'rata kredita',
    'kredit prijenos',
    // Investment transfers
    'ulaganje',
    'investment transfer',
    'fond prijenos',
    'dionice prijenos'
  ];

const PAYMENT_PLATFORMS: readonly string[] = [
  'aircash', 'revolut', 'paypal', 'skrill', 'wise', 'n26', 'curve', 'bunq', 'monzo', 'transferwise',
];

const CROATIAN_BANKS: readonly string[] = [
  'pbz', 'erste', 'zaba', 'zagrebačka banka', 'otp', 'rba', 'raiffeisen', 'addiko', 'hpb',
  'sberbank', 'kentbank', 'agram banka', 'partner banka', 'podravska banka', 'samoborska banka',
  'slatinska banka',
];

/** Novac ULAZI u novčanik izvoda. Provjerava se PRVO (specifičnije od OUT). */
const IN_PATTERNS: readonly string[] = [
  'uplata na',
  'uplata gotovine',
  'uplata sredstava',
  'nadoplata',
  'dopuna',
  'top up',
  'top-up',
  'topup',
  'polog gotovine',
  'cash deposit',
  'added money',
  'money added',
  'primljeni prijenos',
  'incoming transfer',
  'prijenos s računa',
  'prijenos sa računa',
  'transfer from',
  'deposit',
];

/** Novac IZLAZI iz novčanika izvoda. */
const OUT_PATTERNS: readonly string[] = [
  'podizanje',
  'bankomat',
  'atm',
  'cash withdrawal',
  'isplata s',
  'isplata sa',
  'isplata na',
  'outgoing transfer',
  'odlazni prijenos',
  'prijenos na',
  'prebacivanje na',
  'transfer to',
  'withdrawal',
  'payout',
];

const norm = (value: string | null | undefined): string =>
  String(value ?? '').toLowerCase().trim();

/** Prepoznaje je li redak interni prijenos (bez smjera). */
export function isTransferDescription(description: string | null | undefined): boolean {
  const desc = norm(description);
  if (!desc) return false;

  for (const keyword of TRANSFER_KEYWORDS) {
    if (desc.includes(keyword)) return true;
  }

  for (const platform of PAYMENT_PLATFORMS) {
    if (
      desc.includes(`uplata na ${platform}`) ||
      desc.includes(`prijenos na ${platform}`) ||
      desc.includes(`transfer to ${platform}`) ||
      desc.includes(`${platform} uplata`) ||
      desc.includes(`${platform} prijenos`)
    ) {
      return true;
    }
  }

  for (const bank of CROATIAN_BANKS) {
    if (desc.includes(bank) && (desc.includes('prijenos') || desc.includes('transfer') || desc.includes('prebacivanje'))) {
      return true;
    }
  }

  if (
    (desc.includes('visa') || desc.includes('mastercard') || desc.includes('maestro') ||
      desc.includes('diners') || desc.includes('amex') || desc.includes('american express')) &&
    (desc.includes('top') || desc.includes('nadoplata') || desc.includes('uplata') || desc.includes('dopuna'))
  ) {
    return true;
  }

  if (
    /hr\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{1}/.test(desc) &&
    (desc.includes('prijenos') || desc.includes('transfer') || desc.includes('prebacivanje'))
  ) {
    return true;
  }

  return false;
}

/**
 * Smjer iz opisa retka. `null` znači "ne znam" — pozivatelj MORA pitati
 * korisnika umjesto da pretpostavi.
 */
export function detectTransferDirection(
  description: string | null | undefined,
): MoneyDirection | null {
  const desc = norm(description);
  if (!desc) return null;
  for (const p of IN_PATTERNS) if (desc.includes(p)) return 'in';
  for (const p of OUT_PATTERNS) if (desc.includes(p)) return 'out';
  return null;
}

/**
 * Zamjena za stari `isInternalTransfer(): boolean` — vraća i smjer.
 */
export function classifyTransferDescription(
  description: string | null | undefined,
): TransferClassification {
  const isTransfer = isTransferDescription(description);
  if (!isTransfer) return { isTransfer: false, direction: null, confidence: 'high' };
  const direction = detectTransferDirection(description);
  return {
    isTransfer: true,
    direction,
    confidence: direction ? 'high' : 'low',
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_RE = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function toSourceUuid(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const m = CUSTOM_RE.exec(raw);
  if (m) return m[1].toLowerCase();
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  return null;
}

export interface TransferPairInput {
  /** Novčanik čiji se izvod uvozi (kanonski `custom:<uuid>` ili slug). */
  readonly statementSource: string;
  /** Druga strana prijenosa — UUID `custom_payment_sources` reda. */
  readonly counterpartSourceId: string;
  readonly direction: MoneyDirection;
}

export interface TransferPair {
  /** Ide u `expenses.payment_source` — strana koja PLAĆA. */
  readonly paymentSource: string;
  /** Ide u `expenses.income_source_id` — strana koja PRIMA. */
  readonly incomeSourceId: string;
}

/**
 * JEDINO mjesto koje slaže par (payment_source, income_source_id) za prijenos.
 * Vraća `null` kad par nije moguće složiti (npr. dolazni prijenos na novčanik
 * koji nije `custom:` izvor) — pozivatelj tada NE smije pisati.
 */
export function buildTransferPair(input: TransferPairInput): TransferPair | null {
  // Druga strana je uvijek raw id `custom_payment_sources` reda (bez prefiksa).
  const counterpartRaw = String(input.counterpartSourceId ?? '').trim();
  const counterpart = (toSourceUuid(counterpartRaw) ?? counterpartRaw.replace(/^custom:/i, '')).toLowerCase();
  if (!counterpart) return null;

  if (input.direction === 'out') {
    const statement = String(input.statementSource ?? '').trim();
    if (!statement) return null;
    if (statement.replace(/^custom:/i, '').toLowerCase() === counterpart) return null; // sam sebi
    return { paymentSource: statement, incomeSourceId: counterpart };
  }

  // 'in' → druga strana plaća, novčanik izvoda prima.
  const statementUuid = toSourceUuid(input.statementSource);
  if (!statementUuid || statementUuid === counterpart) return null;
  return { paymentSource: `custom:${counterpart}`, incomeSourceId: statementUuid };
}

export interface BankTxDirectionInput {
  /** ISO 20022 indikator iz bankovnog API-ja (`CRDT`/`DBIT`). */
  readonly creditDebitIndicator?: string | null;
  /** Iznos kakav je banka poslala (može biti predznačen). */
  readonly amount?: number | string | null;
  readonly creditorName?: string | null;
  readonly debtorName?: string | null;
}

export interface BankTxDirectionResult {
  readonly direction: MoneyDirection;
  readonly confidence: DirectionConfidence;
  /** Strojno čitljiv razlog — ide u log kad je pouzdanost niska. */
  readonly reason: string;
}

/**
 * Smjer bankovne transakcije. Uz indikator gleda i predznak iznosa te
 * creditor/debtor polja; kad se izvori ne slažu, predznak iznosa pobjeđuje i
 * pouzdanost pada na `low` (pozivatelj to loga).
 */
export function resolveBankTxDirection(input: BankTxDirectionInput): BankTxDirectionResult {
  const indicatorRaw = String(input.creditDebitIndicator ?? '').trim().toUpperCase();
  const indicator: MoneyDirection | null =
    indicatorRaw === 'CRDT' ? 'in' : indicatorRaw === 'DBIT' ? 'out' : null;

  const amountNum = typeof input.amount === 'string' ? parseFloat(input.amount) : input.amount;
  const signed: MoneyDirection | null =
    typeof amountNum === 'number' && isFinite(amountNum) && amountNum !== 0
      ? (amountNum < 0 ? 'out' : null) // pozitivan iznos ne nosi informaciju
      : null;

  const hasCreditor = !!String(input.creditorName ?? '').trim();
  const hasDebtor = !!String(input.debtorName ?? '').trim();
  const parties: MoneyDirection | null =
    hasCreditor && !hasDebtor ? 'out' : hasDebtor && !hasCreditor ? 'in' : null;

  if (indicator && signed && indicator !== signed) {
    return { direction: signed, confidence: 'low', reason: 'indicator_conflicts_with_amount_sign' };
  }
  if (indicator) {
    return { direction: indicator, confidence: 'high', reason: 'credit_debit_indicator' };
  }
  if (signed) {
    return { direction: signed, confidence: 'medium', reason: 'amount_sign' };
  }
  if (parties) {
    return { direction: parties, confidence: 'low', reason: 'creditor_debtor_fields' };
  }
  return { direction: 'out', confidence: 'low', reason: 'fallback_default_out' };
}
// ---------------- SHARED CORE END ----------------
