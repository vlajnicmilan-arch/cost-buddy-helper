// MAIL UVOZ — transportni dedup (vrata za PRVI dolazak privitka).
//
// UZROK KVARA (kolovoz 2026, nalog #6b): ponovna obrada poruke je pogodila
// ZRCALNU KOPIJU iz drugog maila (isti sha256) — i to kopiju koja je i sama
// bila odbačena kao `duplikat_privitka` — pa je ORIGINAL prepisan u
// `odbaceno` PRIJE ekstrakcije. Odbačena kopija je "sudila" originalu.
//
// Dva pravila:
// 1. Ako stavka za (message_id, attachment_id) VEĆ postoji, ovo je
//    OSVJEŽENJE, ne prvi dolazak → transportni dedup se preskače u cijelosti.
// 2. Sidro dedup pogotka NIKAD ne smije biti stavka koja je i sama
//    transportni duplikat (`classification='duplikat_privitka'` ili
//    `duplicate_of_item_id IS NOT NULL`).

// deno-lint-ignore no-explicit-any
export type DedupClient = { from: (table: string) => any };

export interface TransportDedupParams {
  ownerId: string;
  messageId: string;
  attachmentId: string | null;
  sha: string | null;
}

export type TransportDedupResult =
  | { kind: 'refresh' }
  | { kind: 'duplicate'; anchorId: string }
  | { kind: 'none' };

/** Postoji li već stavka za ovu (poruku, privitak)? Tada je ovo reprocess. */
async function hasExistingItem(
  client: DedupClient,
  { messageId, attachmentId }: { messageId: string; attachmentId: string | null },
): Promise<boolean> {
  let q = client.from('document_ingest_items').select('id').eq('message_id', messageId);
  q = attachmentId ? q.eq('attachment_id', attachmentId) : q.is('attachment_id', null);
  const { data } = await q.limit(1);
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row?.id);
}

export async function resolveTransportDedup(
  client: DedupClient,
  { ownerId, messageId, attachmentId, sha }: TransportDedupParams,
): Promise<TransportDedupResult> {
  if (await hasExistingItem(client, { messageId, attachmentId })) {
    return { kind: 'refresh' };
  }
  if (!sha) return { kind: 'none' };

  const { data } = await client
    .from('document_ingest_items')
    .select('id')
    .eq('owner_user_id', ownerId)
    .eq('dedup_identity', `sha256:${sha}`)
    .neq('message_id', messageId)
    .is('duplicate_of_item_id', null)
    .or('classification.is.null,classification.neq.duplikat_privitka')
    .limit(1);

  const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null | undefined;
  return row?.id ? { kind: 'duplicate', anchorId: row.id } : { kind: 'none' };
}
