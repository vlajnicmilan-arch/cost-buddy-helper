import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || (await req.json().catch(() => ({}))).token;
    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: link, error: linkErr } = await admin
      .from('project_share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (link.revoked_at) {
      return new Response(JSON.stringify({ error: 'revoked' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: project } = await admin
      .from('projects')
      .select('id, name, description, icon, color, status, start_date, end_date, total_budget')
      .eq('id', link.project_id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: 'project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let milestones: any[] = [];
    if (link.show_milestones) {
      const { data } = await admin
        .from('project_milestones')
        .select('id, name, description, status, start_date, due_date, color, sort_order')
        .eq('project_id', project.id)
        .order('sort_order', { ascending: true });
      milestones = data || [];
    }

    let financials: any = null;
    if (link.show_financials) {
      const { data: expenses } = await admin
        .from('expenses')
        .select('amount, type')
        .eq('project_id', project.id);
      const totalSpent = (expenses || []).filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
      const totalIncome = (expenses || []).filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0);
      financials = { totalSpent, totalIncome, totalBudget: Number(project.total_budget) || 0 };
    }

    let photos: any[] = [];
    if (link.show_photos) {
      const { data } = await admin
        .from('project_documents')
        .select('id, file_name, storage_path, captured_at, location_name, document_kind')
        .eq('project_id', project.id)
        .eq('document_kind', 'progress_photo')
        .order('captured_at', { ascending: false })
        .limit(50);
      // Generate signed URLs
      photos = await Promise.all((data || []).map(async (p: any) => {
        if (p.storage_path?.startsWith('local:')) return null;
        const { data: signed } = await admin.storage
          .from('project-documents')
          .createSignedUrl(p.storage_path, 3600);
        return { ...p, url: signed?.signedUrl };
      }));
      photos = photos.filter(Boolean);
    }

    // Update view stats (fire and forget)
    admin.from('project_share_links').update({
      last_viewed_at: new Date().toISOString(),
      view_count: (link.view_count || 0) + 1,
    }).eq('id', link.id).then(() => {});

    return new Response(JSON.stringify({
      project,
      milestones,
      financials,
      photos,
      permissions: {
        show_financials: link.show_financials,
        show_photos: link.show_photos,
        show_milestones: link.show_milestones,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('get-public-project', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
