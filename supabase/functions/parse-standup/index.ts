import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";

interface ParseRequest {
  text: string;
  project_name?: string;
  worker_names?: string[];
}

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quota = await checkAiQuota(auth.supabase, auth.userId, "parse-standup");
    if (quota) return quota;


    const { text, project_name, worker_names }: ParseRequest = await req.json();
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Missing or too short text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const workerHint = Array.isArray(worker_names) && worker_names.length > 0
      ? `Poznata imena radnika za usporedbu (koristi točno ovaj zapis ako se podudara): ${worker_names.slice(0, 25).join(', ')}.`
      : '';

    const prompt = `Ti si asistent koji strukturira dnevne radne izvještaje s gradilišta.
Korisnik je diktirao što je danas rađeno na projektu${project_name ? ` "${project_name}"` : ''}.
${workerHint}

Tekst izvještaja:
"""
${text.trim()}
"""

Vrati STRIKTNO JSON (bez markdowna, bez dodatnog teksta) s ovim poljima:
{
  "summary": "kratki sažetak u 1-2 rečenice",
  "workers": [{"name": "ime prezime", "hours": broj_sati_kao_broj, "task": "kratki opis posla"}],
  "materials": [{"name": "naziv stavke", "quantity": broj, "unit": "kom|m2|m|kg|vreća|..."}],
  "milestone_hint": "ako se spominje faza/posao, napiši kratku oznaku, inače null",
  "notes": "ostale napomene ili null"
}
Ako podatak nije naveden, koristi null ili praznu listu.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add credits to your Lovable workspace.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: 'AI gateway failed', detail: errText }), {
        status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '{}';
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: cleaned, workers: [], materials: [], notes: null };
    }

    return new Response(JSON.stringify({ result: parsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('parse-standup error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
