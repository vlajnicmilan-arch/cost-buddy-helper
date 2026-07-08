// WS3a-2 Batch A — refactored to write i18n keys into notification row.
// Instant push remains disabled — recipients see it as in-app bell only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { expense_id, payment_source_id, action } = await req.json();

    if (!expense_id || !payment_source_id || !action) {
      return jsonRes({ error: 'bad_request', code: 'missing_fields' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: paymentSource, error: psError } = await supabaseAdmin
      .from('custom_payment_sources')
      .select('id, name, icon, color, user_id')
      .eq('id', payment_source_id)
      .single();

    if (psError || !paymentSource) {
      console.error('Error fetching payment source:', psError);
      return jsonRes({ error: 'not_found', code: 'payment_source_not_found' }, 404);
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
      .eq('user_id', user.id)
      .single();

    const submitterName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const typeSlot = expense.type === 'income' ? 'income' : expense.type === 'transfer' ? 'transfer' : 'expense';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);
    const titleKey = 'notifications.payment_source_transaction.title';
    const messageKey = `notifications.payment_source_transaction.message.${action}.${typeSlot}`;
    const titleVars = { source: paymentSource.name };
    const messageVars = {
      actor: submitterName,
      description: expense.description,
      amount: formattedAmount,
    };

    const { data: members } = await supabaseAdmin
      .from('payment_source_members')
      .select('user_id')
      .eq('payment_source_id', payment_source_id)
      .neq('user_id', user.id);

    const usersToNotify = new Set<string>();
    if (paymentSource.user_id !== user.id) {
      usersToNotify.add(paymentSource.user_id);
    }
    members?.forEach(m => usersToNotify.add(m.user_id));

    if (usersToNotify.size === 0) {
      return jsonRes({ success: true, delivered: 0 });
    }

    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      type: 'payment_source_transaction',
      title: titleKey,
      message: messageKey,
      data: {
        expense_id: expense.id,
        payment_source_id: paymentSource.id,
        payment_source_name: paymentSource.name,
        payment_source_icon: paymentSource.icon,
        payment_source_color: paymentSource.color,
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

    // Instant push disabled — primatelji vide u in-app zvoncu; bez bannera.

    console.log(`Notifications sent to ${usersToNotify.size} user(s) for payment source transaction`);

    return jsonRes({ success: true, delivered: usersToNotify.size });

  } catch (error) {
    console.error('Error in notify-payment-source-transaction:', error);
    return jsonRes({ error: 'internal', code: 'unhandled_exception' }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
