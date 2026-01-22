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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Get the authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nedostaje autorizacija' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get their info
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Neautorizirani pristup' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { expense_id, income_source_id }: NotifyPendingTransactionRequest = await req.json();

    if (!expense_id || !income_source_id) {
      return new Response(
        JSON.stringify({ error: 'Nedostaju potrebni podaci' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the income source to find the owner
    const { data: source, error: sourceError } = await supabaseAdmin
      .from('income_sources')
      .select('id, name, icon, user_id')
      .eq('id', income_source_id)
      .single();

    if (sourceError || !source) {
      console.error('Error fetching income source:', sourceError);
      return new Response(
        JSON.stringify({ error: 'Izvor prihoda nije pronađen' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Don't notify if the user adding the transaction is the owner
    if (source.user_id === user.id) {
      return new Response(
        JSON.stringify({ success: true, message: 'Vlasnik ne treba notifikaciju' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Get submitter's profile for display name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const submitterName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const transactionType = expense.type === 'income' ? 'prihod' : 'trošak';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);

    // Create notification for the owner
    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: source.user_id,
        type: 'pending_transaction',
        title: `Nova transakcija na čekanju`,
        message: `${submitterName} je dodao ${transactionType} "${expense.description}" (${formattedAmount}) u krug "${source.name}". Čeka vaše odobrenje.`,
        data: {
          expense_id: expense.id,
          income_source_id: source.id,
          income_source_name: source.name,
          income_source_icon: source.icon,
          submitter_name: submitterName,
          amount: expense.amount,
          description: expense.description
        }
      });

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
      return new Response(
        JSON.stringify({ error: 'Greška pri slanju obavijesti' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Notification sent to owner ${source.user_id} for pending transaction from ${submitterName}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Obavijest poslana vlasniku' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-pending-transaction:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});