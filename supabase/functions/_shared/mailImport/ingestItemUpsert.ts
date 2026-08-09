// MAIL UVOZ — idempotentno pisanje stavke reda "Na pregled".
//
// UZROK KVARA (kolovoz 2026): worker je za svaku obradu poruke radio SLIJEPI
// INSERT u `document_ingest_items`. Kad je posao ostao zaglavljen i cron ga je
// preuzimao svakih ~10 minuta, ista je poruka rađala novu stavku po ciklusu
// (57 lažnih stavki iz dvije poruke).
//
// Pravilo: stavka je jedinstvena po (message_id, attachment_id). Ponovna
// obrada AŽURIRA postojeću stavku, nikad ne stvara novu. Ako je korisnik već
// odlučio (povezan / potvrdjen / odbacio_korisnik), stavka se NE dira.

/** Stanja u kojima je odluku donio korisnik — ponovna obrada ih ne smije pregaziti. */
export const USER_DECIDED_STATUSES = ['povezan', 'potvrdjen', 'odbacio_korisnik'] as const;

export type UpsertAction = 'inserted' | 'updated' | 'skipped';

export interface UpsertResult {
  id: string | null;
  action: UpsertAction;
  status: string | null;
}

/** Minimalno sučelje Supabase klijenta koje ovaj modul koristi (radi testabilnosti). */
// deno-lint-ignore no-explicit-any
export type IngestItemClient = { from: (table: string) => any };

export interface UpsertParams {
  messageId: string;
  attachmentId: string | null;
  row: Record<string, unknown>;
}

export async function upsertIngestItem(
  client: IngestItemClient,
  { messageId, attachmentId, row }: UpsertParams,
): Promise<UpsertResult> {
  let query = client
    .from('document_ingest_items')
    .select('id, status, scope_set_by_user')
    .eq('message_id', messageId);

  query = attachmentId
    ? query.eq('attachment_id', attachmentId)
    : query.is('attachment_id', null);

  const { data: existingRows } = await query.order('created_at', { ascending: true }).limit(1);
  const existing = (Array.isArray(existingRows) ? existingRows[0] : existingRows) as
    | { id: string; status: string | null; scope_set_by_user?: boolean | null }
    | null
    | undefined;

  if (existing?.id) {
    if (USER_DECIDED_STATUSES.includes(String(existing.status) as never)) {
      return { id: existing.id, action: 'skipped', status: existing.status ?? null };
    }
    // Korisnikova korekcija odredišta je ODLUKA — ponovna obrada osvježava
    // ekstrakciju, ali NIKAD ne vraća scope na strojni izračun.
    const patch = { ...row };
    if (existing.scope_set_by_user === true) {
      delete patch.scope_type;
      delete patch.scope_id;
    }
    await client
      .from('document_ingest_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    return { id: existing.id, action: 'updated', status: String(row.status ?? existing.status ?? '') };
  }

  const { data: inserted } = await client
    .from('document_ingest_items')
    .insert({ ...row, message_id: messageId, attachment_id: attachmentId })
    .select('id')
    .single();

  const id = (inserted as { id?: string } | null)?.id ?? null;
  return { id, action: 'inserted', status: String(row.status ?? '') };
}
