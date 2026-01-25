import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptProjectInvitationRequest {
  token: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Niste prijavljeni' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Neispravna prijava' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { token }: AcceptProjectInvitationRequest = await req.json();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token nije naveden' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Find the invitation
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('project_invitations')
      .select('*, projects(id, name, icon, color, user_id)')
      .eq('token', token)
      .single();

    if (inviteError || !invitation) {
      return new Response(
        JSON.stringify({ error: 'Pozivnica nije pronađena ili je istekla' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invitation is still valid
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Pozivnica je istekla' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (invitation.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Pozivnica je već iskorištena' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await supabaseAdmin
      .from('project_members')
      .select('id')
      .eq('project_id', invitation.project_id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: 'Već ste član ovog projekta' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add user as member
    const { error: memberError } = await supabaseAdmin
      .from('project_members')
      .insert({
        project_id: invitation.project_id,
        user_id: user.id,
        role: invitation.role
      });

    if (memberError) {
      console.error('Error adding member:', memberError);
      return new Response(
        JSON.stringify({ error: 'Greška pri pridruživanju projektu' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update invitation status
    await supabaseAdmin
      .from('project_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    // Get user's display name for notification
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const memberName = profile?.display_name || 'Netko';
    const project = invitation.projects as any;

    // Send notification to project owner
    if (project?.user_id) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: project.user_id,
          type: 'member_joined_project',
          title: 'Novi član projekta',
          message: `${memberName} se pridružio/la projektu "${project.name}"`,
          data: {
            project_id: invitation.project_id,
            member_id: user.id,
            member_name: memberName
          }
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Uspješno ste se pridružili projektu',
        project: {
          id: project?.id,
          name: project?.name,
          icon: project?.icon,
          color: project?.color
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in accept-project-invitation:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
