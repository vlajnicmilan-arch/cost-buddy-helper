import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";

interface ProjectContextItem {
  id: string;
  name: string;
  milestones?: { id: string; name: string }[];
  recent_merchants?: string[];
}

interface AnalyzeRequest {
  base64?: string;
  url?: string;
  mime_type?: string;
  project_context?: ProjectContextItem[];
}

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: AnalyzeRequest = await req.json();
    if (!body.base64 && !body.url) {
      return new Response(JSON.stringify({ error: 'Missing base64 or url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dataUrl: string;
    if (body.base64) {
      const mime = body.mime_type || 'image/jpeg';
      dataUrl = `data:${mime};base64,${body.base64}`;
    } else {
      const fetchRes = await fetch(body.url!);
      const buf = new Uint8Array(await fetchRes.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const b64 = btoa(binary);
      const mime = body.mime_type || fetchRes.headers.get('content-type') || 'image/jpeg';
      dataUrl = `data:${mime};base64,${b64}`;
    }

    // Build optional project context block
    let contextBlock = '';
    if (Array.isArray(body.project_context) && body.project_context.length > 0) {
      const summary = body.project_context.slice(0, 25).map((p) => {
        const ms = (p.milestones || []).slice(0, 8).map((m) => `    - ${m.id}: ${m.name}`).join('\n');
        const merchants = (p.recent_merchants || []).slice(0, 8).join(', ');
        return `- ${p.id}: ${p.name}${merchants ? ` (česti dobavljači: ${merchants})` : ''}${ms ? `\n  faze:\n${ms}` : ''}`;
      }).join('\n');

      contextBlock = `\n\nDOSTUPNI PROJEKTI (predloži najbolji match na temelju trgovca, iznosa i konteksta — koristi točno ID iz liste):\n${summary}\n\nU JSON dodaj polja: "suggested_project_id" (string ili null) i "suggested_milestone_id" (string ili null) i kratko "suggestion_reason" (string ili null).`;
    }

    const prompt = `Analiziraj ovaj dokument (račun, ugovor, ponuda ili sl.) i vrati STRIKTNO JSON s ovim poljima (null ako nije primjenjivo):
{
  "type": "račun|ugovor|ponuda|drugo",
  "merchant": "ime trgovca/dobavljača",
  "date": "YYYY-MM-DD",
  "amount": broj (ukupni iznos),
  "currency": "EUR|HRK|USD|...",
  "vat_amount": broj,
  "vat_rate": broj (postotak),
  "category": "materijali|usluge|alat|prijevoz|hrana|drugo",
  "items": [{"name": "...", "quantity": 1, "price": 0}],
  "summary": "Kratki opis u 1 rečenici"
}${contextBlock}
Vrati SAMO JSON, bez markdowna ili dodatnog teksta.`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add credits to your Lovable workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI gateway failed', detail: errText }), {
        status: aiRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || '{}';

    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: cleaned, summary: 'AI nije vratio strukturirani JSON' };
    }

    return new Response(JSON.stringify({ analysis: parsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('analyze-document error', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
