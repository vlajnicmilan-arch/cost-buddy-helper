// Push vlasniku kad radnik javi „Nisam primio" (worker_report_payout_not_received).
// In-app obavijest upisuje RPC; ovdje ide samo push iz outbox reda.
// deno-lint-ignore no-explicit-any
type Admin = any;

export async function deliverNotReceived(
  admin: Admin,
  payload: { report_id?: string },
): Promise<{ ok: true; delivered: number } | { ok: false; error: string }> {
  if (!payload?.report_id) return { ok: true, delivered: 0 };
  const { data: report, error } = await admin
    .from('worker_payout_receipt_reports')
    .select('id, owner_user_id, payout_id, batch_id')
    .eq('id', payload.report_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!report) return { ok: true, delivered: 0 };

  const dedup = `worker_payout_nr:${report.payout_id ?? report.batch_id}`;
  const { data: notif } = await admin
    .from('notifications')
    .select('title, message, data')
    .eq('user_id', report.owner_user_id)
    .eq('dedup_key', dedup)
    .maybeSingle();
  const d = (notif?.data ?? {}) as Record<string, unknown>;
  const vars = (d.message_vars ?? {}) as { worker?: string; amount?: string };

  try {
    await admin.functions.invoke('send-push', {
      body: {
        user_id: report.owner_user_id,
        title: 'Isplata nije primljena',
        body: `${vars.worker ?? ''} javlja da nije primio isplatu ${vars.amount ?? ''}.`.trim(),
        source: 'notify-worker-payout',
        data: {
          type: 'worker_payout_not_received',
          category: 'worker_payouts',
          route: d.route ?? null,
          highlight_type: (d.highlight as { type?: string } | null)?.type ?? null,
          highlight_id: (d.highlight as { id?: string } | null)?.id ?? null,
          i18n_title_key: 'notifications.worker_payout.not_received.title',
          i18n_body_key: 'notifications.worker_payout.not_received.message',
          title_vars: d.title_vars ?? {},
          message_vars: vars,
        },
      },
    });
  } catch (e) {
    console.error('[notify-worker-payout] not_received push failed:', e);
  }
  return { ok: true, delivered: 1 };
}
