// WS3a-2 Batch A — refactored to write i18n keys into notification row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyPendingTransactionRequest {
  expense_id: string;
  income_source_id: string;
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
    if (!authHeader) {
      return jsonRes({ error: 'unauthorized', code: 'missing_authorization' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return jsonRes({ error: 'unauthorized', code: 'invalid_token' }, 401);
    }

    const { expense_id, income_source_id }: NotifyPendingTransactionRequest = await req.json();

    if (!expense_id || !income_source_id) {
      return jsonRes({ error: 'bad_request', code: 'missing_fields' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('income_sources')
      .select('id, name, icon, user_id')
      .eq('id', income_source_id)
      .single();

    if (sourceError || !source) {
      console.error('Error fetching income source:', sourceError);
      return jsonRes({ error: 'not_found', code: 'income_source_not_found' }, 404);
    }

    if (source.user_id === user.id) {
      return jsonRes({ success: true, delivered: 0, reason: 'owner_is_submitter' });
    }

    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('expenses')
      .select('id, description, amount, type, project_id')
      .eq('id', expense_id)
      .single();

    if (expenseError || !expense) {
      console.error('Error fetching expense:', expenseError);
      return jsonRes({ error: 'not_found', code: 'expense_not_found' }, 404);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const submitterName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const typeSlot = expense.type === 'income' ? 'income' : 'expense';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);
    const titleKey = 'notifications.pending_transaction.title';
    const messageKey = `notifications.pending_transaction.message.${typeSlot}`;
    const titleVars = {};
    const messageVars = {
      actor: submitterName,
      description: expense.description,
      amount: formattedAmount,
      source: source.name,
    };

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: source.user_id,
        type: 'pending_transaction',
        title: titleKey,
        message: messageKey,
        data: {
          expense_id: expense.id,
          income_source_id: source.id,
          income_source_name: source.name,
          income_source_icon: source.icon,
          submitter_name: submitterName,
          amount: expense.amount,
          description: expense.description,
          title_vars: titleVars,
          message_vars: messageVars,
        }
      });

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
      return jsonRes({ error: 'internal', code: 'notification_insert_failed' }, 500);
    }

    // Instant push disabled — in-app notification only; shared/pending pushes must
    // not interrupt users during the day. Digest handles project-scope batching.
    if (expense.project_id) {
      try {
        await supabaseAdmin.rpc('enqueue_participant_digest_event', {
          p_project_id: expense.project_id,
          p_actor_user_id: user.id,
          p_event: {
            kind: 'pending_transaction_created',
            actor_name: submitterName,
            label: expense.description ?? null,
            ref_id: expense.id ?? null,
            at: new Date().toISOString(),
          },
        });
      } catch (digestErr) {
        console.error('[notify-pending-transaction] digest enqueue error', digestErr);
      }
    }

    console.log(`Notification sent to owner ${source.user_id} for pending transaction from ${submitterName}`);

    return jsonRes({ success: true, delivered: 1 });

  } catch (error) {
    console.error('Error in notify-pending-transaction:', error);
    return jsonRes({ error: 'internal', code: 'unhandled_exception' }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
