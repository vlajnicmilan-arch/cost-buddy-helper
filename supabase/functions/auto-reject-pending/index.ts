import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushNotification } from '../_shared/sendPushNotification.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find all pending transactions older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredTransactions, error: fetchError } = await supabase
      .from('expenses')
      .select('id, description, submitted_by, user_id, project_id')
      .eq('status', 'pending')
      .lt('created_at', twentyFourHoursAgo);

    if (fetchError) {
      console.error('Error fetching expired transactions:', fetchError);
      throw fetchError;
    }

    if (!expiredTransactions || expiredTransactions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expired transactions found', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${expiredTransactions.length} expired pending transactions`);

    // Delete expired transactions
    const expiredIds = expiredTransactions.map(t => t.id);
    
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .in('id', expiredIds);

    if (deleteError) {
      console.error('Error deleting expired transactions:', deleteError);
      throw deleteError;
    }

    // Send notifications to submitters
    const notifications = expiredTransactions
      .filter(t => t.submitted_by)
      .map(t => ({
        user_id: t.submitted_by,
        type: 'transaction_auto_rejected',
        title: 'Transakcija automatski odbijena',
        message: `Vaša transakcija "${t.description}" je automatski odbijena jer nije odobrena u roku od 24 sata.`,
        data: {
          transaction_id: t.id,
          project_id: t.project_id
        }
      }));

    if (notifications.length > 0) {
      const { error: notifyError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifyError) {
        console.error('Error sending notifications:', notifyError);
        // Don't throw, notifications are not critical
      }

      // Best-effort push fan-out
      await Promise.all(
        notifications.map((n) =>
          sendPushNotification({
            user_id: n.user_id,
            title: n.title,
            body: n.message,
            data: { ...n.data, type: 'transaction_auto_rejected' },
          })
        )
      );
    }

    return new Response(
      JSON.stringify({ 
        message: 'Auto-rejected expired transactions', 
        count: expiredTransactions.length,
        notificationsSent: notifications.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in auto-reject-pending:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
