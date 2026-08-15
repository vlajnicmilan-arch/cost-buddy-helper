/**
 * BRIEF-VRATA (V1) — čista logika.
 *
 * Vrata su pozdravni ekran s istinama i izborima PRIJE ulaska u aplikaciju.
 * Ovaj modul ne dira DOM ni mrežu: samo tipovi + odluke (učestalost, tišina).
 *
 * Željezna pravila:
 *  1. Učestalost: vrata se prikazuju samo na prvi ulazak u lokalnom danu ili
 *     nakon >= 4 h od prethodnog prikaza.
 *  2. Tišina je značajka: ako nema nijedne istine — vrata se ne prikazuju.
 *  3. Fail-open: sve nepoznato/pokvareno => bez vrata, ravno u aplikaciju.
 */

import { clearContinuity } from './brief/continuity';

export const BRIEF_GATE_LAST_SHOWN_KEY = 'vmb-brief-gate:last-shown:v1';
export const BRIEF_GATE_DISABLED_KEY = 'vmb-brief-gate:disabled:v1';
export const BRIEF_GATE_CACHE_KEY = 'brief-gate:v1';

/** Minimalni razmak između dva prikaza vrata (4 h). */
export const BRIEF_GATE_MIN_GAP_MS = 4 * 60 * 60 * 1000;

/** Tvrdi rok za RPC revalidaciju; nakon njega vrata se preskaču. */
export const BRIEF_GATE_RPC_TIMEOUT_MS = 400;

/**
 * Granica svježine sjemena iz predmemorije (15 min). Starije sjeme tretira se
 * kao da ga NEMA — odluku preuzima tvrdi rok od 400 ms i fail-open.
 */
export const BRIEF_GATE_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

export interface BriefGateSnapshot {
  enabled: boolean;
  invoices?: { count: number; nextDue: string | null };
  documents?: { count: number };
  attention?: { count: number };
}

export interface BriefGateTruths {
  invoiceCount: number;
  invoiceNextDue: string | null;
  documentCount: number;
  attentionCount: number;
  hasImportDraft: boolean;
}

/** Lokalni dan (YYYY-MM-DD) u vremenskoj zoni uređaja. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pravilo učestalosti: prvi ulazak u danu ILI >= 4 h od zadnjeg prikaza.
 * Nevaljan/prazan žig => dopušteno (prvi put).
 */
export function isFrequencyAllowed(lastShownIso: string | null, now: Date): boolean {
  if (!lastShownIso) return true;
  const last = new Date(lastShownIso);
  if (Number.isNaN(last.getTime())) return true;
  if (localDayKey(last) !== localDayKey(now)) return true;
  return now.getTime() - last.getTime() >= BRIEF_GATE_MIN_GAP_MS;
}

/** Tišina: nijedna istina => bez vrata. */
export function hasAnyTruth(truths: BriefGateTruths): boolean {
  return (
    truths.invoiceCount > 0 ||
    truths.documentCount > 0 ||
    truths.attentionCount > 0 ||
    truths.hasImportDraft
  );
}

export function truthsFromSnapshot(
  snapshot: BriefGateSnapshot | null,
  hasImportDraft: boolean,
): BriefGateTruths {
  return {
    invoiceCount: snapshot?.invoices?.count ?? 0,
    invoiceNextDue: snapshot?.invoices?.nextDue ?? null,
    documentCount: snapshot?.documents?.count ?? 0,
    attentionCount: snapshot?.attention?.count ?? 0,
    hasImportDraft,
  };
}

export interface GateCandidateInput {
  /** Build flag (kill switch). */
  buildEnabled: boolean;
  /** Korisnikov trajni prekidač iz postavki. */
  userDisabled: boolean;
  /** ISO žig zadnjeg prikaza (localStorage). */
  lastShownIso: string | null;
  now: Date;
}

/**
 * Sinkroni, 0 ms filter PRIJE bilo kakvog rada: smije li se uopće pokušati
 * prikazati vrata. Ne odlučuje o tišini (to traži snimku).
 */
export function isGateCandidate(input: GateCandidateInput): boolean {
  if (!input.buildEnabled) return false;
  if (input.userDisabled) return false;
  return isFrequencyAllowed(input.lastShownIso, input.now);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(override?: StorageLike | null): StorageLike | null {
  if (override) return override;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastShown(storage?: StorageLike | null): string | null {
  try {
    return safeStorage(storage)?.getItem(BRIEF_GATE_LAST_SHOWN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function markShown(now: Date, storage?: StorageLike | null): void {
  try {
    safeStorage(storage)?.setItem(BRIEF_GATE_LAST_SHOWN_KEY, now.toISOString());
  } catch {
    /* private mode / quota — fail-open */
  }
}

/**
 * Brise zig zadnjeg prikaza i zapis kontinuiteta, tako da se vrata prikazu pri
 * sljedecem ulasku. Pravilo ucestalosti ostaje nepromijenjeno.
 */
export function resetBriefGateFrequency(storage?: StorageLike | null): void {
  try {
    safeStorage(storage)?.removeItem(BRIEF_GATE_LAST_SHOWN_KEY);
  } catch {
    /* private mode / quota — fail-open */
  }
  clearContinuity(storage);
}

export function isUserDisabled(storage?: StorageLike | null): boolean {
  try {
    return safeStorage(storage)?.getItem(BRIEF_GATE_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUserDisabled(disabled: boolean, storage?: StorageLike | null): void {
  try {
    const s = safeStorage(storage);
    if (!s) return;
    if (disabled) s.setItem(BRIEF_GATE_DISABLED_KEY, '1');
    else s.removeItem(BRIEF_GATE_DISABLED_KEY);
  } catch {
    /* noop */
  }
}

export type GreetingSlot = 'morning' | 'day' | 'evening';

export function greetingSlot(now: Date): GreetingSlot {
  const h = now.getHours();
  if (h < 11) return 'morning';
  if (h < 18) return 'day';
  return 'evening';
}
