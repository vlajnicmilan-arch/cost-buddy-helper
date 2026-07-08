// WS3a-2 Batch A — refactored to write in-app notification with i18n_key +
// title_vars/message_vars (client renders via resolveNotificationText) and
// dispatch push via send-push (translator resolves recipient language).
// Instant push remains disabled for project transactions — everyone goes through
// the 19h participant digest via enqueue_participant_digest_event.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyProjectTransactionRequest {
  expense_id: string;
  project_id: string;
  action: 'created' | 'updated';
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
      return jsonRes({ error: 'unauthorized', code: 'missing_authorization' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    const userEmail = claimsData?.claims?.email as string | undefined;

    if (claimsError || !userId) {
      console.error('JWT validation error in notify-project-transaction:', claimsError);
      return jsonRes({ error: 'unauthorized', code: 'invalid_token' }, 401);
    }

    const { expense_id, project_id, action }: NotifyProjectTransactionRequest = await req.json();

    if (!expense_id || !project_id || !action) {
      return jsonRes({ error: 'bad_request', code: 'missing_fields' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, icon, color, user_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return jsonRes({ error: 'not_found', code: 'project_not_found' }, 404);
    }

    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('expenses')
      .select('id, description, amount, type')
      .eq('id', expense_id)
      .single();

    if (expenseError || !expense) {
      console.error('Error fetching expense:', expenseError);
      return jsonRes({ error: 'not_found', code: 'expense_not_found' }, 404);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single();

    const submitterName = profile?.display_name || userEmail?.split('@')[0] || 'Član';
    // Server-side amount format is locale-neutral (HR EUR) and passed verbatim
    // as {{amount}} into the catalog template — matches worker_payout pattern.
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);
    const messageKey = `notifications.project_transaction.message.${action}.${expense.type === 'income' ? 'income' : 'expense'}`;
    const titleKey = 'notifications.project_transaction.title';
    const titleVars = { project: project.name };
    const messageVars = {
      actor: submitterName,
      description: expense.description,
      amount: formattedAmount,
    };

    const { data: members, error: membersError } = await supabaseAdmin
      .from('project_members')
      .select('user_id')
      .eq('project_id', project_id)
      .neq('user_id', userId)
      .neq('role', 'worker');

    if (membersError) {
      console.error('Error fetching project members:', membersError);
      return jsonRes({ error: 'internal', code: 'members_fetch_failed' }, 500);
    }

    const usersToNotify = new Set<string>();
    if (project.user_id !== userId) {
      usersToNotify.add(project.user_id);
    }
    members?.forEach(m => usersToNotify.add(m.user_id));

    if (usersToNotify.size === 0) {
      console.log('No users to notify (current user is the only member/owner)');
      return jsonRes({ success: true, delivered: 0 });
    }

    const notifications = Array.from(usersToNotify).map(recipientId => ({
      user_id: recipientId,
      type: 'project_transaction',
      title: titleKey,
      message: messageKey,
      data: {
        expense_id: expense.id,
        project_id: project.id,
        project_name: project.name,
        project_icon: project.icon,
        project_color: project.color,
        submitter_name: submitterName,
        amount: expense.amount,
        description: expense.description,
        action,
        title_vars: titleVars,
        message_vars: messageVars,
      }
    }));

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (notificationError) {
      console.error('Error creating notifications:', notificationError);
      return jsonRes({ error: 'internal', code: 'notification_insert_failed' }, 500);
    }

    // Instant push disabled — svi primatelji čekaju 19h digest (flush-participant-digest).
    // In-app notification (zvonce) je već upisan iznad i pojavljuje se odmah.

    try {
      await supabaseAdmin.rpc('enqueue_participant_digest_event', {
        p_project_id: project.id,
        p_actor_user_id: userId,
        p_event: {
          kind: `project_transaction_${action}`,
          actor_name: submitterName,
          label: expense.description ?? null,
          ref_id: expense.id ?? null,
          at: new Date().toISOString(),
        },
      });
    } catch (digestErr) {
      console.error('[notify-project-transaction] digest enqueue error', digestErr);
    }

    console.log(`Notifications sent to ${usersToNotify.size} user(s) for project transaction by ${submitterName}`);

    return jsonRes({ success: true, delivered: usersToNotify.size });

  } catch (error) {
    console.error('Error in notify-project-transaction:', error);
    return jsonRes({ error: 'internal', code: 'unhandled_exception' }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
