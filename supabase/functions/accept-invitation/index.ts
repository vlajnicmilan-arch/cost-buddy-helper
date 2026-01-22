import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptInvitationRequest {
  token: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get authorization header for user context
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Morate biti prijavljeni za prihvaćanje pozivnice' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get user info
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('User auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Neispravna autentifikacija' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id, user.email);

    // Parse request body
    const { token }: AcceptInvitationRequest = await req.json();
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token pozivnice je obavezan' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing invitation token:', token);

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Find the invitation
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('income_source_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (invitationError || !invitation) {
      console.error('Invitation not found:', invitationError);
      return new Response(
        JSON.stringify({ error: 'Pozivnica nije pronađena ili je nevažeća' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found invitation:', invitation.id, 'for source:', invitation.income_source_id);

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Pozivnica je istekla' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Pozivnica je već iskorištena' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await supabaseAdmin
      .from('income_source_members')
      .select('id')
      .eq('income_source_id', invitation.income_source_id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: 'Već ste član ovog kruga prihoda' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add user as member
    const { error: memberError } = await supabaseAdmin
      .from('income_source_members')
      .insert({
        income_source_id: invitation.income_source_id,
        user_id: user.id,
        role: 'member'
      });

    if (memberError) {
      console.error('Error adding member:', memberError);
      return new Response(
        JSON.stringify({ error: 'Greška pri dodavanju u krug' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update invitation status
    await supabaseAdmin
      .from('income_source_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    // Get the income source details for response
    const { data: source } = await supabaseAdmin
      .from('income_sources')
      .select('name, icon, user_id')
      .eq('id', invitation.income_source_id)
      .single();

    // Get joining user's display name
    const { data: joiningUserProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const joiningUserName = joiningUserProfile?.display_name || user.email || 'Nepoznati korisnik';

    // Create notification for the owner
    if (source?.user_id) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: source.user_id,
          type: 'member_joined',
          title: 'Novi član u krugu',
          message: `${joiningUserName} se pridružio/la krugu "${source.name}"`,
          data: {
            income_source_id: invitation.income_source_id,
            income_source_name: source.name,
            new_member_id: user.id,
            new_member_name: joiningUserName,
          }
        });
      
      console.log('Notification created for owner:', source.user_id);
    }

    console.log('Successfully added user to income source:', source?.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Uspješno ste se pridružili krugu "${source?.name || 'Nepoznato'}"`,
        source: source
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing invitation:', error);
    return new Response(
      JSON.stringify({ error: 'Interna greška servera' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
