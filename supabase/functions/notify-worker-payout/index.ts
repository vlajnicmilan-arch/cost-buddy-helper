// Notify a project worker (if linked to an app user) about a payout event.
// Fire-and-forget: writes in-app notification + invokes send-push. Never throws
// back to the caller — payout creation must not fail if notification fails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyWorkerPayoutRequest {
  payout_id: string;
  action: 'created' | 'voided';
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
      return new Response(
        JSON.stringify({ error: 'Nedostaje autorizacija' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    const actorId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !actorId) {
      return new Response(
        JSON.stringify({ error: 'Neautorizirani pristup' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: NotifyWorkerPayoutRequest = await req.json();
    const { payout_id, action } = body;
    if (!payout_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Nedostaju potrebni podaci' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Load payout + worker + project in one round-trip.
    const { data: payout, error: payoutErr } = await admin
      .from('project_worker_payouts')
      .select('id, project_id, worker_id, paid_amount, period_start, period_end, status, void_reason')
      .eq('id', payout_id)
      .single();
    if (payoutErr || !payout) {
      return new Response(
        JSON.stringify({ error: 'Isplata nije pronađena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: worker } = await admin
      .from('project_workers')
      .select('id, first_name, last_name, user_id')
      .eq('id', payout.worker_id)
      .single();

    // No linked app account → nothing to deliver.
    if (!worker?.user_id) {
      return new Response(
        JSON.stringify({ success: true, delivered: false, reason: 'worker not linked to app user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if actor == recipient (rare but possible when owner is also the worker).
    if (worker.user_id === actorId) {
      return new Response(
        JSON.stringify({ success: true, delivered: false, reason: 'actor is recipient' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: project } = await admin
      .from('projects')
      .select('id, name')
      .eq('id', payout.project_id)
      .single();
    const projectName = project?.name ?? 'projekt';

    const amount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(payout.paid_amount));

    const isCreated = action === 'created';
    const title = isCreated
      ? `Nova isplata — ${projectName}`
      : `Isplata poništena — ${projectName}`;
    const message = isCreated
      ? `Zaprimljena isplata ${amount} za period ${payout.period_start} → ${payout.period_end}.`
      : `Vaša isplata ${amount} (${payout.period_start} → ${payout.period_end}) je poništena${payout.void_reason ? ` — razlog: ${payout.void_reason}` : ''}.`;

    // In-app notification (bell).
    await admin.from('notifications').insert({
      user_id: worker.user_id,
      type: isCreated ? 'worker_payout_created' : 'worker_payout_voided',
      title,
      message,
      data: {
        payout_id: payout.id,
        project_id: payout.project_id,
        project_name: projectName,
        worker_id: worker.id,
        paid_amount: Number(payout.paid_amount),
        period_start: payout.period_start,
        period_end: payout.period_end,
        action,
      },
    });

    // Instant push (respects per-category user preference in send-push).
    try {
      await admin.functions.invoke('send-push', {
        body: {
          user_id: worker.user_id,
          title,
          body: message,
          source: 'notify-worker-payout',
          data: {
            category: 'worker_payouts',
            payout_id: payout.id,
            project_id: payout.project_id,
            action,
          },
        },
      });
    } catch (pushErr) {
      console.error('[notify-worker-payout] send-push failed:', pushErr);
    }

    return new Response(
      JSON.stringify({ success: true, delivered: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in notify-worker-payout:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
