/**
 * F1 — Knjigovodstvena klasifikacija ulaznog računa.
 *
 * Tri kategorije na razini računa: „pripadnost projektu", „alat",
 * „osnovna sredstva". Oznaka „materijalni trošak" se NE sprema — izvodi se
 * iz izvora plaćanja (privatni izvor/gotovina) prema tvrtki računa, a ako je
 * nema, prema tvrtki pripisanog projekta.
 *
 * Sve funkcije su čiste: bez mreže, bez okoline — testiraju se izravno.
 */
import { isPersonalSourceForProfile } from '@/lib/receiptBusinessRouting';

export type AccountingCategory = 'project' | 'tool' | 'fixed_asset';
export type AccountingCategorySource = 'ai' | 'user';

export const ACCOUNTING_CATEGORIES: readonly AccountingCategory[] = [
  'project',
  'tool',
  'fixed_asset',
];

export const isAccountingCategory = (value: unknown): value is AccountingCategory =>
  typeof value === 'string' && (ACCOUNTING_CATEGORIES as readonly string[]).includes(value);

/** Najmanje polja računa potrebna za odluke ove datoteke. */
export interface AccountingInvoiceLike {
  business_profile_id?: string | null;
  project_id?: string | null;
  paid_at?: string | null;
}

export interface ProjectLite {
  id: string;
  business_profile_id?: string | null;
}

/**
 * Pravilo ulaska u pripremu za knjigovođu: račun je poslovni ako je usmjeren
 * na tvrtku ILI je pripisan projektu koji pripada tvrtki. Čisto osobni
 * računi (ni firma, ni poslovni projekt) ostaju izvan pripreme.
 */
export const isAccountingRelevantInvoice = (
  invoice: AccountingInvoiceLike,
  projects: readonly ProjectLite[],
): boolean => {
  if (invoice.business_profile_id) return true;
  if (!invoice.project_id) return false;
  const project = projects.find((p) => p.id === invoice.project_id);
  return !!project?.business_profile_id;
};

// --- Prijedlog kategorije (deterministički, bez AI poziva) ---

/** Nazivi stavki/opisi koji upućuju na alat (potrošni alat i pribor). */
const TOOL_KEYWORDS = [
  'alat', 'bosch', 'makita', 'dewalt', 'einhell', 'villager', 'metabo', 'hilti',
  'odvijač', 'odvijac', 'ključ', 'kljuc', 'svrdlo', 'pila', 'brusilica', 'bušilica',
  'busilica', 'čekić', 'cekic', 'kliješta', 'klijesta', 'meter', 'libela',
];

/** Nazivi koji upućuju na trajno sredstvo (uz prag iznosa). */
const FIXED_ASSET_KEYWORDS = [
  'stroj', 'vozilo', 'računalo', 'racunalo', 'laptop', 'server', 'printer',
  'pisač', 'pisac', 'monitor', 'oprema', 'namještaj', 'namjestaj', 'klima',
];

/** Prag iznosa (EUR) iznad kojeg stavka sa signalom sredstva postaje „osnovna sredstva". */
const FIXED_ASSET_MIN_TOTAL = 1000;

export interface SuggestInvoiceLike {
  supplier_name?: string | null;
  total_amount?: number | null;
  items?: unknown;
}

const collectText = (invoice: SuggestInvoiceLike): string => {
  const parts: string[] = [];
  if (invoice.supplier_name) parts.push(invoice.supplier_name);
  if (Array.isArray(invoice.items)) {
    for (const item of invoice.items) {
      const name = (item as { name?: unknown } | null)?.name;
      if (typeof name === 'string') parts.push(name);
    }
  }
  return parts.join(' ').toLowerCase();
};

const containsAny = (text: string, keywords: readonly string[]): boolean =>
  keywords.some((k) => text.includes(k));

/**
 * Deterministički prijedlog kategorije za račun koji nije prošao kroz sken
 * (eRačun XML, mail). Bez dodatnog AI poziva i bez troška; prijedlog se nikad
 * ne sprema sam — sprema se tek kad ga korisnik potvrdi.
 */
export const suggestAccountingCategory = (
  invoice: SuggestInvoiceLike,
): AccountingCategory | null => {
  const text = collectText(invoice);
  if (!text.trim()) return null;
  const total = Math.abs(Number(invoice.total_amount ?? 0));
  if (containsAny(text, FIXED_ASSET_KEYWORDS) && total >= FIXED_ASSET_MIN_TOTAL) {
    return 'fixed_asset';
  }
  if (containsAny(text, TOOL_KEYWORDS)) return 'tool';
  if (containsAny(text, FIXED_ASSET_KEYWORDS)) return 'fixed_asset';
  return 'project';
};

// --- Izvedena oznaka „materijalni trošak" ---

export interface PaymentSourceLite {
  id: string;
  business_profile_id?: string | null;
}

const CUSTOM_SOURCE_PREFIX = 'custom:';

const extractCustomSourceId = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource) return null;
  return paymentSource.startsWith(CUSTOM_SOURCE_PREFIX)
    ? paymentSource.slice(CUSTOM_SOURCE_PREFIX.length)
    : null;
};

export interface MaterialExpenseInput {
  invoice: AccountingInvoiceLike;
  /** `payment_source` povezanog troška (`custom:<uuid>`, `cash`, ...). */
  paidExpensePaymentSource?: string | null;
  sources: readonly PaymentSourceLite[];
  projects: readonly ProjectLite[];
}

/**
 * „Materijalni trošak" — plaćeno iz privatnog izvora (privatna kartica ili
 * gotovina), a račun je poslovni (na tvrtku ili pripisan poslovnom projektu).
 * Ne sprema se; izvodi se pri prikazu.
 */
export const deriveMaterialExpenseFlag = (input: MaterialExpenseInput): boolean => {
  const { invoice, paidExpensePaymentSource, sources, projects } = input;
  if (!isAccountingRelevantInvoice(invoice, projects)) return false;
  if (!invoice.paid_at || !paidExpensePaymentSource) return false;

  const targetBusinessProfileId =
    invoice.business_profile_id ??
    projects.find((p) => p.id === invoice.project_id)?.business_profile_id ??
    null;
  if (!targetBusinessProfileId) return false;

  // Gotovina je uvijek privatni izvor — firma nema gotovinski račun u aplikaciji.
  if (paidExpensePaymentSource === 'cash') return true;

  const customSourceId = extractCustomSourceId(paidExpensePaymentSource);
  if (!customSourceId) return false;
  return isPersonalSourceForProfile({
    customPaymentSourceId: customSourceId,
    sources,
    targetBusinessProfileId,
  });
};
