// Push (FCM) delivery for worker payout events.
//
// IMPORTANT: This function NO LONGER writes the in-app `notifications` row.
// That is done reliably server-side by the AFTER INSERT/UPDATE triggers on
// public.project_worker_payouts (see migration V2-B), which cannot be lost
// when the client aborts. This function's sole job is best-effort push.
//
// Primary path: invoked from the database with { outbox_dedup_ref } (first attempt
// in enqueue_worker_payout_notifications, retries via krug-notify-outbox-retry cron).
// Marks the outbox row delivered on success and on intentional skip.
// Legacy path: client JWT call from older app builds — skipped when the event is queued.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isInternalBearer, markOutboxDelivered, payoutEventKey } from './outbox.ts';
import { deliverNotReceived } from './notReceived.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


interface NotifyRequest {
  payout_id?: string;
  batch_id?: string;
  action: 'created' | 'voided';
}

interface PayoutRow {
  id: string;
  project_id: string;
  worker_id: string;
  paid_amount: number;
  period_start: string;
  period_end: string;
  status: string;
  void_reason: string | null;
  batch_id: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonRes({ error: 'Nedostaje autorizacija' }, 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const body: NotifyRequest & { outbox_dedup_ref?: string } = await req.json();
    const payoutCols = 'id, project_id, worker_id, paid_amount, period_start, period_end, status, void_reason, batch_id';

    let actorId: string | undefined;
    let action: NotifyRequest['action'];
    let batch_id: string | null | undefined;
    let payouts: PayoutRow[] = [];
    let outboxRef: string | null = null;

    if (body.outbox_dedup_ref && isInternalBearer(authHeader, supabaseAnonKey, supabaseServiceKey)) {
      // Server path: the outbox row (written by enqueue_worker_payout_notifications) is the only input.
      const { data: row, error } = await admin
        .from('krug_notify_outbox')
        .select('dedup_ref, event_type, payload, delivered_at, source')
        .eq('dedup_ref', body.outbox_dedup_ref)
        .eq('source', 'worker_payout')
        .maybeSingle();
      if (error) return jsonRes({ error: error.message }, 500);
      if (!row) return jsonRes({ error: 'Outbox red nije pronađen' }, 404);
      if (row.delivered_at) return jsonRes({ success: true, skipped: 'already_delivered' });
      outboxRef = row.dedup_ref as string;
      if (row.event_type === 'worker_payout_not_received') {
        const res = await deliverNotReceived(admin, row.payload as { report_id?: string });
        if (!res.ok) return jsonRes({ error: res.error }, 500);
        await markOutboxDelivered(admin, outboxRef);
        return jsonRes({ success: true, delivered: res.delivered });
      }
      const p = (row.payload ?? {}) as { payout_ids?: string[]; batch_id?: string | null; action?: string; actor_id?: string };
      actorId = p.actor_id ?? undefined;
      action = p.action as NotifyRequest['action'];
      batch_id = p.batch_id ?? null;
      const ids = p.payout_ids ?? [];
      if (ids.length > 0) {
        const { data, error: pErr } = await admin.from('project_worker_payouts').select(payoutCols).in('id', ids);
        if (pErr) return jsonRes({ error: pErr.message }, 500);
        payouts = (data ?? []) as PayoutRow[];
      }
    } else {
      // Legacy client path (published app still calls this). Push now goes through the outbox,
      // so skip when the server already queued this event.
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
      actorId = claimsData?.claims?.sub as string | undefined;
      if (claimsError || !actorId) {
        return jsonRes({ error: 'Neautorizirani pristup' }, 401);
      }
      const { payout_id } = body;
      action = body.action;
      batch_id = body.batch_id;
      if ((!payout_id && !batch_id) || !action) {
        return jsonRes({ error: 'Nedostaju potrebni podaci' }, 400);
      }
      if (batch_id) {
        const { data, error } = await admin.from('project_worker_payouts').select(payoutCols).eq('batch_id', batch_id);
        if (error) return jsonRes({ error: error.message }, 500);
        payouts = (data ?? []) as PayoutRow[];
      } else {
        const { data, error } = await admin.from('project_worker_payouts').select(payoutCols).eq('id', payout_id!).maybeSingle();
        if (error) return jsonRes({ error: error.message }, 500);
        if (!data) return jsonRes({ error: 'Isplata nije pronađena' }, 404);
        payouts = [data as PayoutRow];
      }
      if (payouts.length > 0) {
        const key = payoutEventKey(payouts.map((p) => p.id), batch_id ?? payouts[0].batch_id, action);
        const { data: queued } = await admin.from('krug_notify_outbox').select('dedup_ref').eq('dedup_ref', key).maybeSingle();
        if (queued) return jsonRes({ success: true, skipped: 'server_outbox' });
      }
    }

    if (payouts.length === 0) {
      if (outboxRef) await markOutboxDelivered(admin, outboxRef);
      return jsonRes({ success: true, delivered: false, reason: 'no payouts in batch' });
    }

    // Group by recipient (worker.user_id). Different workers in a batch → separate notifications.
    const workerIds = [...new Set(payouts.map((p) => p.worker_id))];
    const { data: workers } = await admin
      .from('project_workers')
      .select('id, first_name, last_name, user_id')
      .in('id', workerIds);
    const workerMap = new Map<string, { user_id: string | null; name: string }>();
    for (const w of workers ?? []) {
      workerMap.set((w as any).id, {
        user_id: (w as any).user_id ?? null,
        name: `${(w as any).first_name ?? ''} ${(w as any).last_name ?? ''}`.trim(),
      });
    }

    const projectIds = [...new Set(payouts.map((p) => p.project_id))];
    const { data: projects } = await admin
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    const projectMap = new Map<string, string>();
    for (const p of projects ?? []) projectMap.set((p as any).id, (p as any).name ?? 'projekt');

    // Group payouts by recipient user_id.
    const byRecipient = new Map<string, PayoutRow[]>();
    for (const p of payouts) {
      const w = workerMap.get(p.worker_id);
      if (!w?.user_id) continue;                 // no linked account
      if (w.user_id === actorId) continue;        // actor == recipient
      const list = byRecipient.get(w.user_id) ?? [];
      list.push(p);
      byRecipient.set(w.user_id, list);
    }

    const isCreated = action === 'created';
    let delivered = 0;

    for (const [recipientUserId, recPayouts] of byRecipient.entries()) {
      const total = recPayouts.reduce((sum, p) => sum + Number(p.paid_amount), 0);
      const projectNames = [...new Set(recPayouts.map((p) => projectMap.get(p.project_id) ?? 'projekt'))];
      // Server-side amount format is locale-neutral; the {{amount}} placeholder
      // is inserted verbatim by the catalog translator. Matches the DB trigger
      // (enqueue_worker_payout_notifications) format for consistency.
      const amount = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(total);

      // WS3a-1: send-push translates via data.i18n_title_key / data.i18n_body_key
      // using the recipient's profiles.preferred_language. `title` and `body`
      // remain as fallback pre-rendered HR text in case translation fails so
      // legacy delivery logs stay readable.
      let titleKey: string;
      let bodyKey: string;
      let titleVars: Record<string, unknown>;
      let bodyVars: Record<string, unknown>;
      let title: string;
      let message: string;

      if (recPayouts.length === 1) {
        const p = recPayouts[0];
        const projectName = projectMap.get(p.project_id) ?? 'projekt';
        titleKey = isCreated
          ? 'notifications.worker_payout.created.single.title'
          : 'notifications.worker_payout.voided.single.title';
        bodyKey = isCreated
          ? 'notifications.worker_payout.created.single.message'
          : 'notifications.worker_payout.voided.single.message';
        titleVars = { project: projectName };
        bodyVars = {
          amount,
          period_start: p.period_start,
          period_end: p.period_end,
        };
        title = isCreated ? `Nova isplata — ${projectName}` : `Isplata poništena — ${projectName}`;
        message = isCreated
          ? `Zaprimljena isplata ${amount} za period ${p.period_start} → ${p.period_end}.`
          : `Vaša isplata ${amount} (${p.period_start} → ${p.period_end}) je poništena${p.void_reason ? ` — razlog: ${p.void_reason}` : ''}.`;
      } else {
        titleKey = isCreated
          ? 'notifications.worker_payout.created.batch.title'
          : 'notifications.worker_payout.voided.batch.title';
        bodyKey = isCreated
          ? 'notifications.worker_payout.created.batch.message'
          : 'notifications.worker_payout.voided.batch.message';
        titleVars = { count: projectNames.length };
        bodyVars = isCreated
          ? { amount, count: projectNames.length, project_names: projectNames.join(', ') }
          : { amount, count: projectNames.length };
        title = isCreated
          ? `Zbirna isplata — ${projectNames.length} projekta`
          : `Zbirna isplata poništena — ${projectNames.length} projekta`;
        message = isCreated
          ? `Zaprimljeno ${amount} za ${projectNames.length} projekata (${projectNames.join(', ')}).`
          : `Zbirna isplata ${amount} za ${projectNames.length} projekata je poništena.`;
      }

      // NOTE: in-app notification row is inserted by the DB trigger on
      // project_worker_payouts (migration V2-B). Do NOT insert here — would
      // create duplicates and was the source of prior client-abort loss.

      try {
        await admin.functions.invoke('send-push', {
          body: {
            user_id: recipientUserId,
            title,
            body: message,
            source: 'notify-worker-payout',
            data: {
              category: 'worker_payouts',
              batch_id: batch_id ?? recPayouts[0].batch_id ?? null,
              payout_count: recPayouts.length,
              action,
              i18n_title_key: titleKey,
              i18n_body_key: bodyKey,
              title_vars: titleVars,
              message_vars: bodyVars,
            },
          },
        });
      } catch (pushErr) {
        console.error('[notify-worker-payout] send-push failed:', pushErr);
      }
      delivered += 1;
    }


    // Delivered or intentionally skipped (e.g. unlinked worker) — either way the event is done.
    if (outboxRef) await markOutboxDelivered(admin, outboxRef);
    return jsonRes({ success: true, delivered, recipients: byRecipient.size });
  } catch (error) {
    console.error('Error in notify-worker-payout:', error);
    return jsonRes({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
