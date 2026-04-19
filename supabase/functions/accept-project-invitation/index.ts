import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptInvitationRequest {
  token: string;
  type?: 'project' | 'budget'; // defaults to 'project' for backward compatibility
  memberContext?: 'personal' | 'business'; // for project type only
  memberBusinessProfileId?: string | null;  // for project type when context = business
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    console.log('Accept invitation - starting...');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No auth header provided');
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
      console.log('User verification failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Neispravna prijava' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User verified:', user.id);

    // Parse request body
    const { token, type = 'project', memberContext, memberBusinessProfileId }: AcceptInvitationRequest = await req.json();
    if (!token) {
      console.log('No token provided');
      return new Response(
        JSON.stringify({ error: 'Token nije naveden' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate token format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      console.log('Invalid token format');
      return new Response(
        JSON.stringify({ error: 'Neispravan format tokena' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token received:', token, 'type:', type);

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Use atomic function to consume token - this prevents race conditions
    // The function marks the token as used in one atomic operation
    const { data: consumedToken, error: consumeError } = await supabaseAdmin
      .rpc('consume_invitation_token', {
        _token: token,
        _invitation_type: type
      });

    if (consumeError) {
      console.error('Error consuming token:', consumeError);
      return new Response(
        JSON.stringify({ error: 'Greška pri validaciji tokena' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token was valid and consumed
    if (!consumedToken || consumedToken.length === 0) {
      console.log('Token not found, expired, or already used');
      return new Response(
        JSON.stringify({ error: 'Pozivnica nije pronađena, istekla je ili je već iskorištena' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invitation = consumedToken[0];
    console.log('Token consumed successfully, invitation:', invitation.invitation_id);

    const memberTable = type === 'project' ? 'project_members' : 'budget_members';
    const idColumn = type === 'project' ? 'project_id' : 'budget_id';
    const invitationTable = type === 'project' ? 'project_invitations' : 'budget_invitations';

    // Check if user is already a member
    const { data: existingMember } = await supabaseAdmin
      .from(memberTable)
      .select('id')
      .eq(idColumn, invitation.target_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingMember) {
      console.log('User is already a member');
      // Mark as accepted since token was already consumed
      await supabaseAdmin
        .from(invitationTable)
        .update({ status: 'accepted' })
        .eq('id', invitation.invitation_id);
        
      return new Response(
        JSON.stringify({ error: type === 'project' ? 'Već ste član ovog projekta' : 'Već ste član ovog budžeta' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's display name for the member record
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const memberName = profile?.display_name || 'Nepoznato';

    // Add user as member
    const memberData: Record<string, unknown> = {
      [idColumn]: invitation.target_id,
      user_id: user.id,
      role: invitation.role,
    };

    // For project_members, add display_name + member context
    if (type === 'project') {
      memberData.display_name = memberName;

      // Resolve member context: prefer client-provided choice, fall back to invitation suggestion, then 'personal'
      let resolvedContext: 'personal' | 'business' = 'personal';
      let resolvedBusinessProfileId: string | null = null;

      if (memberContext === 'business' && memberBusinessProfileId) {
        // Validate that the business profile belongs to the accepting user
        const { data: bp } = await supabaseAdmin
          .from('business_profiles')
          .select('id')
          .eq('id', memberBusinessProfileId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (bp) {
          resolvedContext = 'business';
          resolvedBusinessProfileId = memberBusinessProfileId;
        }
      } else if (memberContext === 'personal') {
        resolvedContext = 'personal';
      } else {
        // Fall back to invitation's suggested context (informational only — for personal we just store 'personal')
        const { data: invRow } = await supabaseAdmin
          .from('project_invitations')
          .select('suggested_context')
          .eq('id', invitation.invitation_id)
          .maybeSingle();
        if (invRow?.suggested_context === 'business') {
          // No specific business profile chosen — store as personal so the project still appears somewhere
          resolvedContext = 'personal';
        }
      }

      memberData.member_context = resolvedContext;
      memberData.member_business_profile_id = resolvedBusinessProfileId;
    }

    const { error: memberError } = await supabaseAdmin
      .from(memberTable)
      .insert(memberData);

    if (memberError) {
      console.error('Error adding member:', memberError);
      return new Response(
        JSON.stringify({ error: 'Greška pri pridruživanju: ' + memberError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Member added successfully');

    // Initialize default permissions (all optional tabs hidden)
    if (type === 'project') {
      const optionalTabs = ['timeline', 'milestones', 'workers', 'collaborators', 'funding', 'transactions'];
      const permRows = optionalTabs.map(tab_key => ({
        project_id: invitation.target_id,
        user_id: user.id,
        tab_key,
        visible: false,
      }));

      const { error: permError } = await supabaseAdmin
        .from('project_member_permissions')
        .upsert(permRows, { onConflict: 'project_id,user_id,tab_key' });

      if (permError) {
        console.log('Error initializing permissions:', permError.message);
      } else {
        console.log('Default permissions initialized');
      }
    }

    // Update invitation status to accepted
    const { error: updateError } = await supabaseAdmin
      .from(invitationTable)
      .update({ status: 'accepted' })
      .eq('id', invitation.invitation_id);

    if (updateError) {
      console.log('Error updating invitation status:', updateError.message);
    }

    // Get target details for response
    const targetTable = type === 'project' ? 'projects' : 'budget_plans';
    const { data: targetData } = await supabaseAdmin
      .from(targetTable)
      .select('id, name, icon, color, user_id')
      .eq('id', invitation.target_id)
      .single();

    // Send notification to owner/inviter
    const ownerId = targetData?.user_id || invitation.invited_by;
    if (ownerId && ownerId !== user.id) {
      const { error: notifyError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: ownerId,
          type: type === 'project' ? 'member_joined_project' : 'member_joined_budget',
          title: type === 'project' ? 'Novi član projekta' : 'Novi član budžeta',
          message: `${memberName} se pridružio/la ${type === 'project' ? 'projektu' : 'budžetu'} "${invitation.target_name}"`,
          data: {
            target_id: invitation.target_id,
            member_id: user.id,
            member_name: memberName
          }
        });

      if (notifyError) {
        console.log('Error sending notification:', notifyError.message);
      }
    }

    console.log('Accept invitation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: type === 'project' ? 'Uspješno ste se pridružili projektu' : 'Uspješno ste se pridružili budžetu',
        target: {
          id: targetData?.id,
          name: targetData?.name || invitation.target_name,
          icon: targetData?.icon,
          color: targetData?.color
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in accept-invitation:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera: ' + errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
