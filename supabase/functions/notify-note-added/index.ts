import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushNotification, sendPushNotificationToMany } from '../_shared/sendPushNotification.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyNoteAddedRequest {
  expense_id: string;
  income_source_id?: string;
  project_id?: string;
  payment_source_id?: string;
  note: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get the authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Nedostaje autorizacija' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token from header
    const token = authHeader.replace('Bearer ', '');

    // Create admin client for privileged operations (including user verification)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the token and get user using admin client with service role
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      console.log('User auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Neautorizirani pristup' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { expense_id, income_source_id, project_id, payment_source_id, note }: NotifyNoteAddedRequest = await req.json();
    console.log('Received request:', { expense_id, income_source_id, project_id, payment_source_id, note: note?.substring(0, 50) });

    if (!expense_id || (!income_source_id && !project_id && !payment_source_id) || !note) {
      return new Response(
        JSON.stringify({ error: 'Nedostaju potrebni podaci' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const memberName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const truncatedNote = note.length > 100 ? note.substring(0, 100) + '...' : note;

    // Handle PROJECT notes
    if (project_id) {
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
        type: 'project_note_added',
        title: `Novi komentar u projektu "${project.name}"`,
        message: `${memberName} je komentirao transakciju "${expense.description}": "${truncatedNote}"`,
        data: {
          expense_id: expense.id,
          project_id: project.id,
          project_name: project.name,
          project_icon: project.icon,
          project_color: project.color,
          member_name: memberName,
          note: note,
          description: expense.description
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

      await sendPushNotificationToMany(Array.from(usersToNotify), {
        title: `Novi komentar u projektu "${project.name}"`,
        body: `${memberName}: ${truncatedNote}`,
        data: { expense_id: expense.id, project_id: project.id, type: 'project_note_added' },
        source: 'notify-note-added',
      });

      console.log(`Project note notifications sent to ${usersToNotify.size} user(s) from ${memberName}`);

      return new Response(
        JSON.stringify({ success: true, message: `Obavijesti poslane (${usersToNotify.size})` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle INCOME SOURCE notes (original logic)
    if (income_source_id) {
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

      // Don't notify if the user adding the note is the owner
      if (source.user_id === user.id) {
        console.log('User is owner, skipping notification');
        return new Response(
          JSON.stringify({ success: true, message: 'Vlasnik ne treba notifikaciju' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create notification for the owner
      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: source.user_id,
          type: 'note_added',
          title: `Nova napomena na transakciji`,
          message: `${memberName} je dodao napomenu uz transakciju "${expense.description}" u projektu "${source.name}": "${truncatedNote}"`,
          data: {
            expense_id: expense.id,
            income_source_id: source.id,
            income_source_name: source.name,
            income_source_icon: source.icon,
            member_name: memberName,
            note: note,
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

      await sendPushNotification({
        user_id: source.user_id,
        title: 'Nova napomena na transakciji',
        body: `${memberName}: ${truncatedNote}`,
        data: { expense_id: expense.id, income_source_id: source.id, type: 'note_added' },
        source: 'notify-note-added',
      });

      console.log(`Note notification sent to owner ${source.user_id} from ${memberName}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Obavijest poslana vlasniku' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle PAYMENT SOURCE notes
    if (payment_source_id) {
      const { data: source, error: sourceError } = await supabaseAdmin
        .from('custom_payment_sources')
        .select('id, name, icon, color, user_id')
        .eq('id', payment_source_id)
        .single();

      if (sourceError || !source) {
        console.error('Error fetching payment source:', sourceError);
        return new Response(
          JSON.stringify({ error: 'Račun nije pronađen' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get all payment source members to notify (except the current user)
      const { data: members } = await supabaseAdmin
        .from('payment_source_members')
        .select('user_id')
        .eq('payment_source_id', payment_source_id)
        .neq('user_id', user.id);

      const usersToNotify = new Set<string>();
      
      // Notify owner if not current user
      if (source.user_id !== user.id) {
        usersToNotify.add(source.user_id);
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
        type: 'payment_source_note_added',
        title: `Novi komentar na računu "${source.name}"`,
        message: `${memberName} je komentirao transakciju "${expense.description}": "${truncatedNote}"`,
        data: {
          expense_id: expense.id,
          payment_source_id: source.id,
          payment_source_name: source.name,
          payment_source_icon: source.icon,
          payment_source_color: source.color,
          member_name: memberName,
          note: note,
          description: expense.description
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

      await sendPushNotificationToMany(Array.from(usersToNotify), {
        title: `Novi komentar na računu "${source.name}"`,
        body: `${memberName}: ${truncatedNote}`,
        data: { expense_id: expense.id, payment_source_id: source.id, type: 'payment_source_note_added' },
        source: 'notify-note-added',
      });

      console.log(`Payment source note notifications sent to ${usersToNotify.size} user(s)`);

      return new Response(
        JSON.stringify({ success: true, message: `Obavijesti poslane (${usersToNotify.size})` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Nedostaje project_id, income_source_id ili payment_source_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-note-added:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
