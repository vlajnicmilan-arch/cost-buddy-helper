import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    const { pdfBase64, bankType } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'No PDF provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing PDF statement for user:', userId, 'bank:', bankType);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Use Gemini for PDF parsing
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Ti si asistent za analizu bankovnih izvoda u PDF formatu. Analiziraj PDF i izvuci SVE transakcije.

Za svaku transakciju izvuci:
1. date: datum transakcije (format: YYYY-MM-DD)
2. description: opis transakcije
3. amount: iznos (pozitivan broj)
4. type: "income" za uplate/priljeve, "expense" za isplate/odljeve
5. category: automatski kategoriziraj - food, transport, shopping, entertainment, bills, health, other
6. merchant_name: naziv trgovca/primatelja ako postoji

Banka/izvor: ${bankType || 'nepoznato'}

Odgovori SAMO u JSON formatu:
{
  "transactions": [
    {
      "date": "2025-01-20",
      "description": "Plaćanje - Konzum",
      "amount": 45.50,
      "type": "expense",
      "category": "food",
      "merchant_name": "Konzum"
    },
    {
      "date": "2025-01-19",
      "description": "Uplata plaće",
      "amount": 1500.00,
      "type": "income",
      "category": "other",
      "merchant_name": null
    }
  ],
  "summary": {
    "total_income": 1500.00,
    "total_expenses": 45.50,
    "transaction_count": 2
  }
}

Ako ne možeš pročitati PDF ili nema transakcija, vrati:
{
  "error": "Nije moguće pročitati PDF izvod"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analiziraj ovaj bankovni izvod u PDF formatu i izvuci sve transakcije.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: pdfBase64.startsWith('data:') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Previše zahtjeva. Pokušaj ponovno za minutu.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Nedostaje kredita za AI obradu.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('AI gateway error');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content);

    // Parse JSON from AI response
    let statementData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        statementData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Nije moguće analizirati PDF izvod' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (statementData.error) {
      return new Response(
        JSON.stringify({ error: statementData.error }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsed statement data:', statementData);

    return new Response(
      JSON.stringify({
        transactions: statementData.transactions || [],
        summary: statementData.summary || null
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing PDF statement:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
