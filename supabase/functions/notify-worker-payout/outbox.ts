// Outbox pomoćnici za notify-worker-payout.
//
// Ključ događaja mora biti isti kao u enqueue_worker_payout_notifications:
// jedna isplata → payout_id, više njih → batch_id.

export function payoutEventKey(
  payoutIds: string[],
  batchId: string | null | undefined,
  action: string,
): string {
  const ref = payoutIds.length === 1 || !batchId ? payoutIds[0] : batchId;
  return `worker_payout:${ref}:${action}`;
}

/** Interni poziv iz baze nosi objavljivi (anon) ili servisni ključ, ne korisnički JWT. */
export function isInternalBearer(
  authHeader: string | null,
  anonKey: string,
  serviceKey: string,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  return (!!anonKey && token === anonKey) || (!!serviceKey && token === serviceKey);
}

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** Označi outbox red isporučenim. Kvar se logira i ne ruši odgovor. */
export async function markOutboxDelivered(admin: RpcClient, dedupRef: string): Promise<boolean> {
  try {
    const res = (await admin.rpc("krug_notify_outbox_mark_delivered", {
      p_dedup_ref: dedupRef,
    })) as { error?: { message?: string } | null } | undefined;
    if (res?.error) {
      console.error(`[notify-worker-payout] outbox_mark_error dedup=${dedupRef}: ${res.error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[notify-worker-payout] outbox_mark_error dedup=${dedupRef}: ${(e as Error).message}`);
    return false;
  }
}
