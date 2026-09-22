/**
 * Statement-level fingerprints for short-circuiting re-uploads of bank statements.
 *
 * Two layers:
 *  - file hash:    SHA-256 of raw file bytes (catches identical re-downloads).
 *  - content hash: SHA-256 of sorted per-transaction `computeImportFingerprint` values
 *                  (catches the same statement re-saved with different PDF metadata,
 *                  and matches the backfilled hash for legacy import_batch rows).
 *
 * Stored in `imported_statements`. Read before parsing; written after a successful import.
 */
import { supabase } from '@/integrations/supabase/client';
import { computeImportFingerprint, computeImportKeys } from '@/lib/importFingerprint';

async function sha256HexFromBuffer(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle: SubtleCrypto | undefined = (globalThis as any).crypto?.subtle;
  if (subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const hash = await subtle.digest('SHA-256', copy.buffer);
    const out = new Uint8Array(hash);
    let hex = '';
    for (let i = 0; i < out.length; i += 1) hex += out[i].toString(16).padStart(2, '0');
    return hex;
  }
  // Non-crypto fallback (shouldn't trigger in real browsers)
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function sha256HexFromString(s: string): Promise<string> {
  return sha256HexFromBuffer(new TextEncoder().encode(s));
}

export async function computeFileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return sha256HexFromBuffer(buf);
}

/**
 * Content hash mirrors the SQL backfill in 20260520-imported_statements migration:
 *   SHA-256( sorted per-row keys joined with '|' )
 *
 * PRIJELAZ NA V2: novi hash se računa po V2 ključevima retka (`imp2:`, bez
 * AI-teksta). Stari hash (po `computeImportFingerprint`) se i dalje računa,
 * ali SAMO za pretragu ranije uvezenih izvoda.
 */
export interface ContentHashTransaction {
  date: Date | string;
  type: string;
  amount: number;
  description?: string | null;
  merchant_name?: string | null;
  balance_after?: number | null;
  /** Pozicija retka u izvornom tekstu izvoda (stabilan `ord:N`). */
  source_order?: number | null;
}

/** Stari (v1) statement hash — zadržan za pretragu ranijih uvoza. */
export async function computeLegacyContentHash(
  userId: string,
  paymentSource: string | null,
  transactions: ContentHashTransaction[],
): Promise<string> {
  if (transactions.length === 0) return '';
  const fps = await Promise.all(
    transactions.map(tx => computeImportFingerprint({
      userId,
      paymentSource,
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      merchantName: tx.merchant_name,
    })),
  );
  fps.sort();
  return sha256HexFromString(fps.join('|'));
}

/** Novi (v2) statement hash — po ključevima retka bez AI-teksta. */
export async function computeContentHash(
  userId: string,
  paymentSource: string | null,
  transactions: ContentHashTransaction[],
): Promise<string> {
  if (transactions.length === 0) return '';
  const keys = await computeImportKeys(transactions.map(tx => ({
    userId,
    paymentSource,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balance_after ?? null,
    sourceOrder: tx.source_order ?? null,
  })));
  // Redak bez dokazivog redoslijeda nema v2 ključ — u hash ulazi njegov stari
  // otisak, da izvod i dalje ima jednoznačan potpis.
  const legacy = await Promise.all(transactions.map((tx, i) => (
    keys[i] ? Promise.resolve(null) : computeImportFingerprint({
      userId,
      paymentSource,
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      merchantName: tx.merchant_name,
    })
  )));
  const values = keys.map((k, i) => k ?? (legacy[i] as string));
  values.sort();
  return sha256HexFromString(values.join('|'));
}

/** Oba hasha odjednom: v2 se upisuje, oba se traže. */
export async function computeContentHashes(
  userId: string,
  paymentSource: string | null,
  transactions: ContentHashTransaction[],
): Promise<{ contentHash: string; legacyContentHash: string }> {
  const [contentHash, legacyContentHash] = await Promise.all([
    computeContentHash(userId, paymentSource, transactions),
    computeLegacyContentHash(userId, paymentSource, transactions),
  ]);
  return { contentHash, legacyContentHash };
}

export interface ExistingStatement {
  id: string;
  imported_at: string;
  transactions_count: number | null;
  file_name: string | null;
}

export async function findExistingStatement(
  userId: string,
  hashes: { fileHash?: string | null; contentHash?: string | null | (string | null | undefined)[] },
): Promise<ExistingStatement | null> {
  const conditions: string[] = [];
  if (hashes.fileHash) conditions.push(`file_hash.eq.${hashes.fileHash}`);
  const contentHashes = Array.isArray(hashes.contentHash) ? hashes.contentHash : [hashes.contentHash];
  for (const h of contentHashes) {
    if (h) conditions.push(`content_hash.eq.${h}`);
  }
  if (conditions.length === 0) return null;

  const { data, error } = await supabase
    .from('imported_statements')
    .select('id, imported_at, transactions_count, file_name')
    .eq('user_id', userId)
    .or(conditions.join(','))
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Don't block import on a query failure; treat as miss.
    // eslint-disable-next-line no-console
    console.warn('[statementFingerprint] findExistingStatement failed:', error.message);
    return null;
  }
  return data ?? null;
}


export async function recordImportedStatement(params: {
  userId: string;
  paymentSourceId?: string | null;
  fileHash?: string | null;
  contentHash?: string | null;
  sourceDocumentItemId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  transactionsCount?: number | null;
  importBatchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('imported_statements').insert({
    user_id: params.userId,
    payment_source_id: params.paymentSourceId ?? null,
    file_hash: params.fileHash ?? null,
    content_hash: params.contentHash ?? null,
    source_document_item_id: params.sourceDocumentItemId ?? null,
    file_name: params.fileName ?? null,
    file_size: params.fileSize ?? null,
    mime_type: params.mimeType ?? null,
    transactions_count: params.transactionsCount ?? null,
    import_batch_id: params.importBatchId ?? null,
  });
  if (error) {
    // Non-fatal: row-level dedup remains as last line of defense.
    // eslint-disable-next-line no-console
    console.warn('[statementFingerprint] recordImportedStatement failed:', error.message);
  }
}
