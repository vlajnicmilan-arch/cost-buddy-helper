/**
 * Payment Source — canonical normalization (Foundation Plan, Val 1).
 *
 * Kanonski format za `expenses.payment_source`:
 *   1) built-in slug iz `PAYMENT_SOURCES` (npr. `cash`, `bank`, `visa_gold`)
 *   2) `custom:UUID` gdje UUID postoji u `custom_payment_sources`
 *
 * Nedozvoljeno (nakon Vala 3 DB CHECK):
 *   - raw UUID bez `custom:` prefiksa
 *   - prazan string
 *   - bilo koji free-text koji ne pripada gornjim grupama
 *
 * Ovaj modul je JEDINI source-of-truth normalizacije za klijentski
 * write-path. Pozivati ga iz CRUD layera prije svakog
 * `.from('expenses').insert/update`.
 *
 * Server-side writer (supabase/functions/bank-sync-transactions) već
 * proizvodi `custom:${linked_payment_source_id}` i ne treba dodatni
 * server-side helper.
 */

import { PAYMENT_SOURCES } from '@/types/expense';

const BUILT_IN_SLUGS: ReadonlySet<string> = new Set(PAYMENT_SOURCES.map((s) => s.id));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_RE = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CanonicalPaymentSource = string;

export interface NormalizeContext {
  /** UUID-ovi custom payment source-a koje korisnik smije referencirati (vlastiti + shared). */
  knownCustomSourceIds: ReadonlySet<string>;
}

export class PaymentSourceNormalizeError extends Error {
  constructor(
    message: string,
    public readonly input: unknown,
    public readonly reason:
      | 'empty'
      | 'unknown_uuid'
      | 'malformed',
  ) {
    super(message);
    this.name = 'PaymentSourceNormalizeError';
  }
}

/**
 * Vrati true ako je string već u kanonskom obliku (built-in slug ili `custom:UUID`).
 * Ne validira postojanje UUID-a u DB-u — vidi `normalizePaymentSource`.
 */
export function isCanonicalShape(value: string): boolean {
  if (BUILT_IN_SLUGS.has(value)) return true;
  if (CUSTOM_RE.test(value)) return true;
  return false;
}

/**
 * Normalizira proizvoljan input u kanonski oblik.
 *
 * Pravila:
 *  - built-in slug → vraća kakav jest
 *  - `custom:UUID` (poznat) → vraća kakav jest (lowercase UUID)
 *  - raw UUID (poznat) → pretvara u `custom:UUID`
 *  - `custom:UUID` ili raw UUID koji nije u `knownCustomSourceIds` → throw `unknown_uuid`
 *  - prazno / null / undefined → throw `empty`
 *  - sve ostalo → throw `malformed`
 *
 * Throwa namjerno; caller bira fallback (npr. UI pokazuje toast, CRUD prekida save).
 */
export function normalizePaymentSource(
  input: string | null | undefined,
  ctx: NormalizeContext,
): CanonicalPaymentSource {
  if (input == null) {
    throw new PaymentSourceNormalizeError('payment_source is null/undefined', input, 'empty');
  }
  const trimmed = String(input).trim();
  if (trimmed === '') {
    throw new PaymentSourceNormalizeError('payment_source is empty', input, 'empty');
  }

  // 1) built-in slug
  if (BUILT_IN_SLUGS.has(trimmed)) return trimmed;

  // 2) custom:UUID
  if (CUSTOM_RE.test(trimmed)) {
    const uuid = trimmed.slice('custom:'.length).toLowerCase();
    if (!ctx.knownCustomSourceIds.has(uuid)) {
      throw new PaymentSourceNormalizeError(
        `custom payment source not found: ${uuid}`,
        input,
        'unknown_uuid',
      );
    }
    return `custom:${uuid}`;
  }

  // 3) raw UUID → upgrade na custom:UUID ako je poznat
  if (UUID_RE.test(trimmed)) {
    const uuid = trimmed.toLowerCase();
    if (!ctx.knownCustomSourceIds.has(uuid)) {
      throw new PaymentSourceNormalizeError(
        `raw uuid payment source not found: ${uuid}`,
        input,
        'unknown_uuid',
      );
    }
    return `custom:${uuid}`;
  }

  throw new PaymentSourceNormalizeError(
    `payment_source format not canonical: ${trimmed}`,
    input,
    'malformed',
  );
}

/**
 * Shape-only canonicalizer — bez DB lookupa.
 *
 * Koristi se u 2 uska slučaja gdje normalizePaymentSource nije
 * primjenjiv jer kontekst (knownCustomSourceIds) nije dostupan:
 *
 *   1) LoanResolveDialog – konstruira `custom:${id}` lokalno
 *   2) SettingsDialog backup-restore – učitava JSON s mogućim
 *      raw UUID vrijednostima iz starih izvoza
 *
 * Pravila (regex-only):
 *   - built-in slug → passthrough
 *   - `custom:UUID` → lowercase passthrough
 *   - raw UUID → prefiks `custom:` (shape upgrade, bez postojanje-check)
 *   - sve ostalo / prazno → `fallback` (default: `'cash'`)
 *
 * DB CHECK constraint će svejedno odbiti malformed vrijednost.
 */
export function coerceCanonicalShape(
  input: string | null | undefined,
  fallback: CanonicalPaymentSource = 'cash',
): CanonicalPaymentSource {
  if (input == null) return fallback;
  const trimmed = String(input).trim();
  if (trimmed === '') return fallback;
  if (BUILT_IN_SLUGS.has(trimmed)) return trimmed;
  const customMatch = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(trimmed);
  if (customMatch) return `custom:${customMatch[1].toLowerCase()}`;
  if (UUID_RE.test(trimmed)) return `custom:${trimmed.toLowerCase()}`;
  return fallback;
}

/**
 * Soft varijanta — vraća `null` umjesto throwa.
 * Koristiti samo za read-side dijagnostiku, ne za write path.
 */
export function tryNormalizePaymentSource(
  input: string | null | undefined,
  ctx: NormalizeContext,
): CanonicalPaymentSource | null {
  try {
    return normalizePaymentSource(input, ctx);
  } catch {
    return null;
  }
}

/**
 * Server-truth fallback varijanta (Milanov mandat, opcija 3).
 *
 * Sretni put je bit-identičan sync `normalizePaymentSource` (built-in slug ili
 * `custom:UUID` prisutan u `ctx.knownCustomSourceIds` → sync return, NULA
 * dodatnih poziva). Fallback grana se aktivira ISKLJUČIVO kad sync grana
 * baci `unknown_uuid` — tada se pod user JWT-om upita baza (RLS presuđuje
 * vidljivost/vlasništvo). DB pogodak → vraća canonical `custom:UUID`; miss
 * → re-throw originalnog `PaymentSourceNormalizeError` (reason nepromijenjen).
 *
 * Motivacija: `knownCustomSourceIds` je in-memory React state; race između
 * fetcha i write-a (multi-instance hookovi, cache hydration, cross-device
 * stale cache) može ostaviti Set prazan iako je izvor u bazi. Server-truth
 * lookup eliminira tu ovisnost bez fake-fallbacka na 'cash'.
 *
 * `dbHasUuid` mora vratiti true SAMO ako je red vidljiv pod trenutnim JWT-om
 * (nikad service role) — RLS check je jedini valjan authority.
 */
export async function normalizePaymentSourceWithDbFallback(
  input: string | null | undefined,
  ctx: NormalizeContext,
  dbHasUuid: (uuid: string) => Promise<boolean>,
): Promise<CanonicalPaymentSource> {
  try {
    return normalizePaymentSource(input, ctx);
  } catch (e) {
    if (!(e instanceof PaymentSourceNormalizeError) || e.reason !== 'unknown_uuid') {
      throw e;
    }
    // Ekstrahiraj UUID iz `custom:UUID` ili raw UUID varijante (isti regex
    // set kao sync grana — ovamo dolazi samo šejp-valjani input).
    const trimmed = String(input).trim();
    const uuid = trimmed.toLowerCase().startsWith('custom:')
      ? trimmed.slice('custom:'.length).toLowerCase()
      : trimmed.toLowerCase();
    if (!UUID_RE.test(uuid)) throw e;
    const ok = await dbHasUuid(uuid);
    if (!ok) throw e;
    return `custom:${uuid}`;
  }
}
