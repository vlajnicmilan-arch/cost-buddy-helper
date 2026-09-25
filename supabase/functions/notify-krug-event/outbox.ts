// Outbox oznaka isporuke za notify-krug-event.
//
// Obrada je završena i kad je namjerno preskočena (dedup pogodak ili
// isključene postavke obavijesti) — takvi redovi se ne ponavljaju. Kvar
// oznake ne smije srušiti odgovor funkcije.

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
}

export async function markOutboxDelivered(
  admin: RpcClient,
  dedupRef: string | null | undefined,
): Promise<void> {
  if (!dedupRef) return;
  try {
    await admin.rpc("krug_notify_outbox_mark_delivered", {
      p_dedup_ref: dedupRef,
    });
  } catch (e) {
    console.error(
      `[notify-krug-event] outbox_mark_error dedup=${dedupRef}: ${(e as Error).message}`,
    );
  }
}
