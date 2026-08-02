// Korak E — obavijesti oko potvrde projektnog troška.
//  - action 'submitted': voditelj je poslao trošak → obavijest vlasniku projekta
//  - action 'reviewed' : vlasnik je odlučio → obavijest podnositelju (s razlogom)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  expense_id: string;
  action: 'submitted' | 'reviewed';
  decision?: 'approve' | 'reject';
  rejection_reason?: string | null;
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonRes({ error: 'unauthorized', code: 'missing_authorization' }, 401);

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return jsonRes({ error: 'unauthorized', code: 'invalid_token' }, 401);

    const body = (await req.json()) as Body;
    if (!body?.expense_id || !body?.action) {
      return jsonRes({ error: 'bad_request', code: 'missing_fields' }, 400);
    }
    if (body.action === 'reviewed' && body.decision !== 'approve' && body.decision !== 'reject') {
      return jsonRes({ error: 'bad_request', code: 'missing_decision' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: expense, error: expenseError } = await admin
      .from('expenses')
      .select('id, description, amount, type, project_id, submitted_by, status, rejection_reason')
      .eq('id', body.expense_id)
      .single();

    if (expenseError || !expense || !expense.project_id) {
      return jsonRes({ error: 'not_found', code: 'expense_not_found' }, 404);
    }

    const { data: project } = await admin
      .from('projects')
      .select('id, name, user_id')
      .eq('id', expense.project_id)
      .single();

    if (!project) return jsonRes({ error: 'not_found', code: 'project_not_found' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const actorName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(expense.amount));

    let recipient: string | null = null;
    let titleKey = '';
    let messageKey = '';
    let messageVars: Record<string, unknown> = {};

    if (body.action === 'submitted') {
      if (project.user_id === user.id) return jsonRes({ success: true, delivered: 0, reason: 'owner_is_submitter' });
      recipient = project.user_id;
      titleKey = 'notifications.project_expense_review.submitted.title';
      messageKey = `notifications.project_expense_review.submitted.message.${expense.type === 'income' ? 'income' : 'expense'}`;
      messageVars = {
        actor: actorName,
        description: expense.description,
        amount: formattedAmount,
        project: project.name,
      };
    } else {
      recipient = expense.submitted_by;
      if (!recipient || recipient === user.id) {
        return jsonRes({ success: true, delivered: 0, reason: 'no_submitter' });
      }
      const slot = body.decision === 'approve' ? 'approved' : 'rejected';
      titleKey = `notifications.project_expense_review.${slot}.title`;
      messageKey = `notifications.project_expense_review.${slot}.message`;
      messageVars = {
        actor: actorName,
        description: expense.description,
        amount: formattedAmount,
        project: project.name,
        reason: body.rejection_reason ?? expense.rejection_reason ?? '',
      };
    }

    const { error: notificationError } = await admin.from('notifications').insert({
      user_id: recipient,
      type: 'project_expense_review',
      title: titleKey,
      message: messageKey,
      data: {
        expense_id: expense.id,
        project_id: project.id,
        project_name: project.name,
        decision: body.decision ?? null,
        rejection_reason: body.rejection_reason ?? expense.rejection_reason ?? null,
        amount: expense.amount,
        description: expense.description,
        title_vars: {},
        message_vars: messageVars,
      },
    });

    if (notificationError) {
      console.error('[notify-project-expense-review] insert failed', notificationError);
      return jsonRes({ error: 'internal', code: 'notification_insert_failed' }, 500);
    }

    return jsonRes({ success: true, delivered: 1 });
  } catch (error) {
    console.error('[notify-project-expense-review] error', error);
    return jsonRes({ error: 'internal' }, 500);
  }
});
