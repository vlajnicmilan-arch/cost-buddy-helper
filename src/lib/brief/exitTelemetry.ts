/**
 * BRIEF-VRATA — MJERENJE IZLAZA (samo zapis, nula utjecaja na ponašanje).
 *
 * Vrata imaju više izlaza koji se izvana ne razlikuju: istek roka, isključena
 * značajka, nijedna sastavljena poruka, uspješan prikaz, korisnikov prekidač i
 * pravilo učestalosti. Ovaj modul je ČISTA logika koja od ulaznih činjenica
 * složi detalje događaja `brief_gate_exit`; slanje radi pozivatelj.
 */
import type { BriefSnapshot } from './types';

export const BRIEF_GATE_EXIT_EVENT = 'brief_gate_exit';

export type BriefExitReason =
  | 'timed_out'
  | 'not_enabled'
  | 'no_messages'
  | 'shown'
  | 'user_disabled'
  | 'frequency_blocked';

export interface BriefExitInput {
  reason: BriefExitReason;
  /** ms od ulaska na /brief do odluke. */
  elapsedMs?: number | null;
  /** Trajanje RPC poziva u ms (null ako nije završio). */
  rpcMs?: number | null;
  /** Je li tvrdi rok istekao prije odgovora. */
  rpcTimedOut?: boolean;
  snapshot?: BriefSnapshot | null;
  messagesCount?: number;
  build?: string | null;
}

export interface BriefExitTruths {
  /** DOSPIJEĆE (incoming_invoices). */
  invoiceCount: number;
  /** NEIZVJESNOST (document_ingest_items na pregledu). */
  documentCount: number;
  /** MAIL (obrađeni dokumenti). */
  attentionCount: number;
  /** V1 nema izvor činjenica za uvozni nacrt — uvijek false. */
  hasImportDraft: boolean;
}

/** Brojke iz snimke, doslovno; nema snimke => sve nule. */
export function truthsFromBriefSnapshot(snapshot: BriefSnapshot | null | undefined): BriefExitTruths {
  const c = snapshot?.categories ?? {};
  return {
    invoiceCount: c.due?.count ?? 0,
    documentCount: c.uncertainty?.count ?? 0,
    attentionCount: c.mail?.count ?? 0,
    hasImportDraft: false,
  };
}

/** Sažetak snimke bez osobnih podataka (bez naziva dobavljača). */
function summarizeSnapshot(snapshot: BriefSnapshot | null | undefined) {
  if (!snapshot) return null;
  const c = snapshot.categories ?? {};
  return {
    enabled: !!snapshot.enabled,
    uncertainty: c.uncertainty ? { count: c.uncertainty.count, watermark: c.uncertainty.watermark ?? null } : null,
    due: c.due
      ? { count: c.due.count, watermark: c.due.watermark ?? null, nextDue: c.due.nextDue ?? null }
      : null,
    mail: c.mail ? { count: c.mail.count, watermark: c.mail.watermark ?? null } : null,
  };
}

const round = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

export function buildBriefExitDetails(input: BriefExitInput): Record<string, unknown> {
  return {
    reason: input.reason,
    elapsed_ms: round(input.elapsedMs),
    rpc_ms: round(input.rpcMs),
    rpc_timed_out: !!input.rpcTimedOut,
    snapshot: summarizeSnapshot(input.snapshot),
    truths: truthsFromBriefSnapshot(input.snapshot),
    messages_count: input.messagesCount ?? 0,
    build: input.build ?? null,
  };
}
