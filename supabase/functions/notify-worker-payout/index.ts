// Notify a project worker (if linked to an app user) about a payout event.
// Supports single payout (payout_id) and batch (batch_id) modes.
// Fire-and-forget: writes in-app notification + invokes send-push. Never throws
// back to the caller — payout creation must not fail if notification fails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    const actorId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !actorId) {
      return jsonRes({ error: 'Neautorizirani pristup' }, 401);
    }

    const body: NotifyRequest = await req.json();
    const { payout_id, batch_id, action } = body;
    if ((!payout_id && !batch_id) || !action) {
      return jsonRes({ error: 'Nedostaju potrebni podaci' }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Load payout rows (1 for single, N for batch).
    let payouts: PayoutRow[] = [];
    if (batch_id) {
      const { data, error } = await admin
        .from('project_worker_payouts')
        .select('id, project_id, worker_id, paid_amount, period_start, period_end, status, void_reason, batch_id')
        .eq('batch_id', batch_id);
      if (error) return jsonRes({ error: error.message }, 500);
      payouts = (data ?? []) as PayoutRow[];
    } else {
      const { data, error } = await admin
        .from('project_worker_payouts')
        .select('id, project_id, worker_id, paid_amount, period_start, period_end, status, void_reason, batch_id')
        .eq('id', payout_id!)
        .maybeSingle();
      if (error) return jsonRes({ error: error.message }, 500);
      if (!data) return jsonRes({ error: 'Isplata nije pronađena' }, 404);
      payouts = [data as PayoutRow];
    }

    if (payouts.length === 0) {
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
      const amount = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(total);

      let title: string;
      let message: string;
      if (recPayouts.length === 1) {
        const p = recPayouts[0];
        const projectName = projectMap.get(p.project_id) ?? 'projekt';
        title = isCreated ? `Nova isplata — ${projectName}` : `Isplata poništena — ${projectName}`;
        message = isCreated
          ? `Zaprimljena isplata ${amount} za period ${p.period_start} → ${p.period_end}.`
          : `Vaša isplata ${amount} (${p.period_start} → ${p.period_end}) je poništena${p.void_reason ? ` — razlog: ${p.void_reason}` : ''}.`;
      } else {
        title = isCreated
          ? `Zbirna isplata — ${projectNames.length} projekta`
          : `Zbirna isplata poništena — ${projectNames.length} projekta`;
        message = isCreated
          ? `Zaprimljeno ${amount} za ${projectNames.length} projekata (${projectNames.join(', ')}).`
          : `Zbirna isplata ${amount} za ${projectNames.length} projekata je poništena.`;
      }

      await admin.from('notifications').insert({
        user_id: recipientUserId,
        type: isCreated ? 'worker_payout_created' : 'worker_payout_voided',
        title,
        message,
        data: {
          batch_id: batch_id ?? recPayouts[0].batch_id ?? null,
          payout_ids: recPayouts.map((p) => p.id),
          project_ids: [...new Set(recPayouts.map((p) => p.project_id))],
          project_names: projectNames,
          paid_amount_total: total,
          action,
        },
      });

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
            },
          },
        });
      } catch (pushErr) {
        console.error('[notify-worker-payout] send-push failed:', pushErr);
      }
      delivered += 1;
    }

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
