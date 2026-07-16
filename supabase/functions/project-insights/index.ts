import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callGemini } from '../_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify membership via user-context client (RLS)
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: project, error: projErr } = await userClient
      .from('projects')
      .select('id, name, total_budget, start_date, end_date, status')
      .eq('id', project_id)
      .single();
    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'project not found or access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull data with service role (already authorized)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: milestones } = await supabase.from('project_milestones')
      .select('name, status, budget, due_date').eq('project_id', project_id);
    const { data: recentExpenses } = await supabase.from('expenses')
      .select('description, amount, date, category, work_type, type')
      .eq('project_id', project_id)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: false });
    const { data: workEntries } = await supabase.from('project_work_entries')
      .select('hours, work_date, task_description')
      .eq('project_id', project_id)
      .gte('work_date', sevenDaysAgo);

    const totalSpentRecent = (recentExpenses || [])
      .filter(e => e.type === 'expense')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalIncomeRecent = (recentExpenses || [])
      .filter(e => e.type === 'income')
      .reduce((s, e) => s + Number(e.amount), 0);
    const totalHours = (workEntries || []).reduce((s, w) => s + Number(w.hours || 0), 0);

    const overdueMs = (milestones || []).filter(m => m.status === 'overdue');
    const completedMs = (milestones || []).filter(m => m.status === 'completed');

    const prompt = `Generiraj kratki tjedni sažetak za projekt "${project.name}".

Statistika zadnjih 7 dana:
- Trošak: ${totalSpentRecent.toFixed(2)} EUR (${recentExpenses?.filter(e => e.type === 'expense').length || 0} transakcija)
- Prihod: ${totalIncomeRecent.toFixed(2)} EUR
- Sati rada: ${totalHours}h
- Završene faze: ${completedMs.length} / ${milestones?.length || 0}
- Faze u kašnjenju: ${overdueMs.map(m => m.name).join(', ') || 'nema'}

Vrati STRIKTNO JSON (bez markdown):
{
  "summary": "kratko 2-3 rečenice na hrvatskom",
  "highlights": ["pozitivna stvar 1", "pozitivna 2"],
  "concerns": ["upozorenje 1"],
  "next_actions": ["preporučena akcija 1", "akcija 2"]
}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: 'Payment required' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: 'AI failed', detail: t }), { status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); } catch { parsed = { summary: cleaned, highlights: [], concerns: [], next_actions: [] }; }

    return new Response(JSON.stringify({
      result: parsed,
      stats: {
        spent_7d: totalSpentRecent,
        income_7d: totalIncomeRecent,
        hours_7d: totalHours,
        completed_milestones: completedMs.length,
        total_milestones: milestones?.length || 0,
        overdue_milestones: overdueMs.length,
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('project-insights error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
