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
    const { expense_id, project_id, action }: NotifyProjectTransactionRequest = await req.json();

    if (!expense_id || !project_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Nedostaju potrebni podaci' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the project details
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, icon, color, user_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return new Response(
        JSON.stringify({ error: 'Projekt nije pronađen' }),
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

    // Get submitter's profile for display name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const submitterName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const transactionType = expense.type === 'income' ? 'prihod' : 'trošak';
    const actionText = action === 'created' ? 'dodao/la' : 'ažurirao/la';
    const formattedAmount = new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR'
    }).format(expense.amount);

    // Get all project members to notify (except the current user)
    const { data: members, error: membersError } = await supabaseAdmin
      .from('project_members')
      .select('user_id')
      .eq('project_id', project_id)
      .neq('user_id', user.id);

    if (membersError) {
      console.error('Error fetching project members:', membersError);
      return new Response(
        JSON.stringify({ error: 'Greška pri dohvaćanju članova' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also notify the project owner if they're not the current user
    const usersToNotify = new Set<string>();
    
    if (project.user_id !== user.id) {
      usersToNotify.add(project.user_id);
    }
    
    members?.forEach(m => usersToNotify.add(m.user_id));

    if (usersToNotify.size === 0) {
      console.log('No users to notify (current user is the only member/owner)');
      return new Response(
        JSON.stringify({ success: true, message: 'Nema korisnika za obavijestiti' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notifications for all relevant users
    const notifications = Array.from(usersToNotify).map(userId => ({
      user_id: userId,
      type: 'project_transaction',
      title: `Transakcija u projektu "${project.name}"`,
      message: `${submitterName} je ${actionText} ${transactionType} "${expense.description}" (${formattedAmount})`,
      data: {
        expense_id: expense.id,
        project_id: project.id,
        project_name: project.name,
        project_icon: project.icon,
        project_color: project.color,
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

    console.log(`Notifications sent to ${usersToNotify.size} user(s) for project transaction by ${submitterName}`);

    return new Response(
      JSON.stringify({ success: true, message: `Obavijesti poslane (${usersToNotify.size})` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-project-transaction:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
