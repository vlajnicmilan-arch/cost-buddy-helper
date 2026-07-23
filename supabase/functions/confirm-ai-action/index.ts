import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { captureEdgeError } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const j = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

interface ProposalRow {
  id: string;
  user_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: 'proposed' | 'confirmed' | 'rejected' | 'expired';
  result: Record<string, unknown> | null;
  expires_at: string;
}

async function executeProposal(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  row: ProposalRow,
): Promise<{ ok: true; new_value: unknown; old_value: unknown } | { ok: false; error: string }> {
  const p = row.payload as Record<string, any>;
  try {
    switch (row.action_type) {
      case 'create_savings_goal': {
        const insertData: Record<string, unknown> = {
          user_id: userId,
          name: p.name,
          target_amount: p.target_amount,
          current_amount: 0,
          icon: p.icon || '🎯',
          color: p.color || '#3b82f6',
          budget_id: null,
        };
        if (p.target_date) insertData.target_date = p.target_date;
        const { data, error } = await supabase
          .from('savings_goals').insert(insertData).select().single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, new_value: data, old_value: null };
      }
      case 'update_savings_goal': {
        const { data: current, error: fe } = await supabase
          .from('savings_goals').select('*')
          .eq('id', p.goal_id).eq('user_id', userId).single();
        if (fe || !current) return { ok: false, error: 'Cilj štednje nije pronađen.' };
        const updates: Record<string, unknown> = {};
        if (p.name) updates.name = p.name;
        if (p.target_amount) updates.target_amount = p.target_amount;
        if (p.target_date) updates.target_date = p.target_date;
        if (p.add_amount) {
          const newAmount = Number((current as any).current_amount) + Number(p.add_amount);
          updates.current_amount = newAmount;
          const targetAmt = p.target_amount || (current as any).target_amount;
          if (newAmount >= targetAmt) {
            updates.is_completed = true;
            updates.completed_at = new Date().toISOString();
          }
        }
        const { data, error } = await supabase
          .from('savings_goals').update(updates)
          .eq('id', p.goal_id).eq('user_id', userId).select().single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, new_value: data, old_value: current };
      }
      case 'create_reminder': {
        const insertData: Record<string, unknown> = {
          user_id: userId,
          title: p.title,
          remind_at: p.remind_at,
          description: p.description || null,
          type: p.type || 'custom',
        };
        if (p.business_profile_id) insertData.business_profile_id = p.business_profile_id;
        const { data, error } = await supabase
          .from('reminders').insert(insertData).select().single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, new_value: data, old_value: null };
      }
      default:
        return { ok: false, error: `Nepoznat tip akcije: ${row.action_type}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nepoznata greška' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'unauthorized' }, 401);

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: cErr } = await supabaseAuth.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return j({ error: 'unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const proposalId = body.proposal_id as string | undefined;
    const decision = body.decision as 'confirm' | 'reject' | undefined;
    if (!proposalId || (decision !== 'confirm' && decision !== 'reject')) {
      return j({ error: 'invalid_request' }, 400);
    }

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: proposal, error: pErr } = await supabaseService
      .from('ai_proposed_actions').select('*').eq('id', proposalId).single();
    if (pErr || !proposal) return j({ error: 'not_found' }, 404);
    if (proposal.user_id !== userId) return j({ error: 'forbidden' }, 403);

    const row = proposal as ProposalRow;

    // Idempotency: if already terminal, replay outcome
    if (row.status === 'confirmed') {
      return j({ status: 'confirmed', idempotent: true, result: row.result });
    }
    if (row.status === 'rejected') {
      return j({ status: 'rejected', idempotent: true });
    }
    if (row.status === 'expired' || new Date(row.expires_at).getTime() < Date.now()) {
      if (row.status !== 'expired') {
        await supabaseService.from('ai_proposed_actions')
          .update({ status: 'expired' }).eq('id', proposalId);
        await supabaseService.from('ai_action_log').insert({
          user_id: userId, proposal_id: proposalId,
          action_type: row.action_type, decision: 'expired',
        });
      }
      return j({ status: 'expired', error: 'proposal_expired' }, 410);
    }

    if (decision === 'reject') {
      await supabaseService.from('ai_proposed_actions')
        .update({ status: 'rejected', rejected_at: new Date().toISOString() })
        .eq('id', proposalId).eq('status', 'proposed');
      await supabaseService.from('ai_action_log').insert({
        user_id: userId, proposal_id: proposalId,
        action_type: row.action_type, decision: 'rejected',
      });
      return j({ status: 'rejected' });
    }

    // Confirm — execute write.
    const result = await executeProposal(supabaseService, userId, row);
    if (!result.ok) return j({ status: 'error', error: result.error }, 400);

    // Atomic terminal transition guarded by WHERE status='proposed'
    const { data: updated, error: uErr } = await supabaseService
      .from('ai_proposed_actions')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        result: { new_value: result.new_value },
      })
      .eq('id', proposalId).eq('status', 'proposed')
      .select().maybeSingle();

    if (uErr) return j({ status: 'error', error: uErr.message }, 500);
    if (!updated) {
      // Someone else confirmed concurrently — return existing outcome.
      const { data: existing } = await supabaseService
        .from('ai_proposed_actions').select('status,result').eq('id', proposalId).single();
      return j({ status: existing?.status ?? 'unknown', idempotent: true, result: existing?.result });
    }

    await supabaseService.from('ai_action_log').insert({
      user_id: userId, proposal_id: proposalId,
      action_type: row.action_type, decision: 'confirmed',
      old_value: result.old_value ?? null,
      new_value: result.new_value ?? null,
    });

    return j({ status: 'confirmed', result: result.new_value });
  } catch (error) {
    console.error('confirm-ai-action error:', error);
    captureEdgeError(error, { functionName: 'confirm-ai-action' });
    return j({ error: error instanceof Error ? error.message : 'Nepoznata greška' }, 500);
  }
});
