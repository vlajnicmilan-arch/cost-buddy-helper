// WS3a-2 Batch A — refactored to write i18n keys into notification row.
// Instant push disabled for all notes — recipients wait for 19h digest (projects)
// or only see the in-app bell (income/payment sources).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Missing or invalid authorization header');
      return jsonRes({ error: 'unauthorized', code: 'missing_authorization' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      console.log('User auth error:', userError);
      return jsonRes({ error: 'unauthorized', code: 'invalid_token' }, 401);
    }

    console.log('Authenticated user:', user.id);

    const { expense_id, income_source_id, project_id, payment_source_id, note }: NotifyNoteAddedRequest = await req.json();
    console.log('Received request:', { expense_id, income_source_id, project_id, payment_source_id, note: note?.substring(0, 50) });

    if (!expense_id || (!income_source_id && !project_id && !payment_source_id) || !note) {
      return jsonRes({ error: 'bad_request', code: 'missing_fields' }, 400);
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

    const memberName = profile?.display_name || user.email?.split('@')[0] || 'Član';
    const truncatedNote = note.length > 100 ? note.substring(0, 100) + '...' : note;

    // Handle PROJECT notes
    if (project_id) {
      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, name, icon, color, user_id')
        .eq('id', project_id)
        .single();

      if (projectError || !project) {
        console.error('Error fetching project:', projectError);
        return jsonRes({ error: 'not_found', code: 'project_not_found' }, 404);
      }

      const { data: members, error: membersError } = await supabaseAdmin
        .from('project_members')
        .select('user_id')
        .eq('project_id', project_id)
        .neq('user_id', user.id)
        .neq('role', 'worker');

      if (membersError) {
        console.error('Error fetching project members:', membersError);
        return jsonRes({ error: 'internal', code: 'members_fetch_failed' }, 500);
      }

      const usersToNotify = new Set<string>();
      if (project.user_id !== user.id) usersToNotify.add(project.user_id);
      members?.forEach(m => usersToNotify.add(m.user_id));

      if (usersToNotify.size === 0) {
        console.log('No users to notify');
        return jsonRes({ success: true, delivered: 0 });
      }

      const titleKey = 'notifications.note_added.project.title';
      const messageKey = 'notifications.note_added.project.message';
      const titleVars = { project: project.name };
      const messageVars = {
        actor: memberName,
        description: expense.description,
        note: truncatedNote,
      };

      const notifications = Array.from(usersToNotify).map(userId => ({
        user_id: userId,
        type: 'project_note_added',
        title: titleKey,
        message: messageKey,
        data: {
          expense_id: expense.id,
          project_id: project.id,
          project_name: project.name,
          project_icon: project.icon,
          project_color: project.color,
          member_name: memberName,
          note,
          description: expense.description,
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

      // Instant push disabled — komentari u projektu čekaju 19h digest.

      try {
        await supabaseAdmin.rpc('enqueue_participant_digest_event', {
          p_project_id: project.id,
          p_actor_user_id: user.id,
          p_event: {
            kind: 'project_note_added',
            actor_name: memberName,
            label: expense.description ?? null,
            ref_id: expense.id ?? null,
            at: new Date().toISOString(),
          },
        });
      } catch (digestErr) {
        console.error('[notify-note-added] digest enqueue error', digestErr);
      }

      console.log(`Project note notifications sent to ${usersToNotify.size} user(s) from ${memberName}`);
      return jsonRes({ success: true, delivered: usersToNotify.size });
    }

    // Handle INCOME SOURCE notes
    if (income_source_id) {
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
        console.log('User is owner, skipping notification');
        return jsonRes({ success: true, delivered: 0, reason: 'owner_is_submitter' });
      }

      const titleKey = 'notifications.note_added.income_source.title';
      const messageKey = 'notifications.note_added.income_source.message';
      const titleVars = {};
      const messageVars = {
        actor: memberName,
        description: expense.description,
        source: source.name,
        note: truncatedNote,
      };

      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: source.user_id,
          type: 'note_added',
          title: titleKey,
          message: messageKey,
          data: {
            expense_id: expense.id,
            income_source_id: source.id,
            income_source_name: source.name,
            income_source_icon: source.icon,
            member_name: memberName,
            note,
            description: expense.description,
            title_vars: titleVars,
            message_vars: messageVars,
          }
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
        return jsonRes({ error: 'internal', code: 'notification_insert_failed' }, 500);
      }

      // Instant push disabled — vlasnik kruga vidi komentar kao in-app zvonce.
      console.log(`Note notification sent to owner ${source.user_id} from ${memberName}`);
      return jsonRes({ success: true, delivered: 1 });
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
        return jsonRes({ error: 'not_found', code: 'payment_source_not_found' }, 404);
      }

      const { data: members } = await supabaseAdmin
        .from('payment_source_members')
        .select('user_id')
        .eq('payment_source_id', payment_source_id)
        .neq('user_id', user.id);

      const usersToNotify = new Set<string>();
      if (source.user_id !== user.id) usersToNotify.add(source.user_id);
      members?.forEach(m => usersToNotify.add(m.user_id));

      if (usersToNotify.size === 0) {
        return jsonRes({ success: true, delivered: 0 });
      }

      const titleKey = 'notifications.note_added.payment_source.title';
      const messageKey = 'notifications.note_added.payment_source.message';
      const titleVars = { source: source.name };
      const messageVars = {
        actor: memberName,
        description: expense.description,
        note: truncatedNote,
      };

      const notifications = Array.from(usersToNotify).map(userId => ({
        user_id: userId,
        type: 'payment_source_note_added',
        title: titleKey,
        message: messageKey,
        data: {
          expense_id: expense.id,
          payment_source_id: source.id,
          payment_source_name: source.name,
          payment_source_icon: source.icon,
          payment_source_color: source.color,
          member_name: memberName,
          note,
          description: expense.description,
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

      // Instant push disabled — komentari na dijeljenim računima ostaju samo in-app.
      console.log(`Payment source note notifications sent to ${usersToNotify.size} user(s)`);
      return jsonRes({ success: true, delivered: usersToNotify.size });
    }

    return jsonRes({ error: 'bad_request', code: 'missing_target_id' }, 400);

  } catch (error) {
    console.error('Error in notify-note-added:', error);
    return jsonRes({ error: 'internal', code: 'unhandled_exception' }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
