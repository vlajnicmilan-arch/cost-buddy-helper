import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushNotificationToMany } from '../_shared/sendPushNotification.ts';

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
      return new Response(
        JSON.stringify({ error: 'Nedostaje autorizacija' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Neautorizirani pristup' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { expense_id, payment_source_id, action } = await req.json();

    if (!expense_id || !payment_source_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Nedostaju potrebni podaci' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the payment source details
    const { data: paymentSource, error: psError } = await supabaseAdmin
      .from('custom_payment_sources')
      .select('id, name, icon, color, user_id')
      .eq('id', payment_source_id)
      .single();

    if (psError || !paymentSource) {
      console.error('Error fetching payment source:', psError);
      return new Response(
        JSON.stringify({ error: 'Račun nije pronađen' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the expense details
    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('expenses')
      .select('id, description, amount, type')
      .eq('id', expense_id)
      .single();

    if (expenseError || !expense) {
      console.error('Error fetching expense:', expenseError);
      return new Response(
        JSON.stringify({ error: 'Transakcija nije pronađena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get submitter's profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const submitterName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const transactionType = expense.type === 'income' ? 'prihod' : expense.type === 'transfer' ? 'prijenos' : 'trošak';
    const actionText = action === 'created' ? 'dodao/la' : 'ažurirao/la';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);

    // Get all payment source members to notify (except the current user)
    const { data: members } = await supabaseAdmin
      .from('payment_source_members')
      .select('user_id')
      .eq('payment_source_id', payment_source_id)
      .neq('user_id', user.id);

    const usersToNotify = new Set<string>();
    
    // Notify owner if not current user
    if (paymentSource.user_id !== user.id) {
      usersToNotify.add(paymentSource.user_id);
    }
    
    members?.forEach(m => usersToNotify.add(m.user_id));

    if (usersToNotify.size === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nema korisnika za obavijestiti' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      type: 'payment_source_transaction',
      title: `Transakcija na računu "${paymentSource.name}"`,
      message: `${submitterName} je ${actionText} ${transactionType} "${expense.description}" (${formattedAmount})`,
      data: {
        expense_id: expense.id,
        payment_source_id: paymentSource.id,
        payment_source_name: paymentSource.name,
        payment_source_icon: paymentSource.icon,
        payment_source_color: paymentSource.color,
        submitter_name: submitterName,
        amount: expense.amount,
        description: expense.description,
        action: action
      }
    }));

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (notificationError) {
      console.error('Error creating notifications:', notificationError);
      return new Response(
        JSON.stringify({ error: 'Greška pri slanju obavijesti' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Best-effort push fan-out
    await sendPushNotificationToMany(Array.from(usersToNotify), {
      title: `Transakcija na računu "${paymentSource.name}"`,
      body: `${submitterName} je ${actionText} ${transactionType} "${expense.description}" (${formattedAmount})`,
      data: {
        expense_id: expense.id,
        payment_source_id: paymentSource.id,
        type: 'payment_source_transaction',
      },
      source: 'notify-payment-source-transaction',
    });

    console.log(`Notifications sent to ${usersToNotify.size} user(s) for payment source transaction`);

    return new Response(
      JSON.stringify({ success: true, message: `Obavijesti poslane (${usersToNotify.size})` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-payment-source-transaction:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
