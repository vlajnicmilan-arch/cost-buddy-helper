import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Čišćenje base64 podataka - mobilni uređaji često dodaju prefiks
function cleanBase64(base64String: string): string {
  if (!base64String) return "";
  let cleaned = base64String.trim();

  // Uklanjanje "data:image/...;base64," prefiksa
  if (cleaned.includes(",") && cleaned.startsWith("data:")) {
    cleaned = cleaned.split(",")[1];
  }

  // Uklanjanje razmaka i novih redova koji se mogu pojaviti na mobitelu
  return cleaned.replace(/\s/g, "");
}

// Detekcija MIME tipa iz base64 podataka
function detectMimeType(base64String: string): string {
  if (base64String.startsWith("data:")) {
    const match = base64String.match(/data:([^;]+);/);
    if (match) return match[1];
  }
  
  // Provjera magic bytes-a
  const cleaned = cleanBase64(base64String);
  if (cleaned.startsWith("/9j/")) return "image/jpeg";
  if (cleaned.startsWith("iVBORw")) return "image/png";
  if (cleaned.startsWith("R0lGOD")) return "image/gif";
  if (cleaned.startsWith("UklGR")) return "image/webp";
  
  return "image/jpeg"; // Default
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header');
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
      console.error('Invalid token:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { imageBase64 } = body;

    if (!imageBase64) {
      console.error('No image provided in request');
      return new Response(
        JSON.stringify({ error: 'No image provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detektiraj MIME tip i očisti base64
    const mimeType = detectMimeType(imageBase64);
    const cleanedBase64 = cleanBase64(imageBase64);
    
    console.log('Processing receipt image for user:', userId);
    console.log('MIME type detected:', mimeType);
    console.log('Base64 length:', cleanedBase64.length);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Kreiraj ispravni data URL za Gemini AI
    const imageDataUrl = `data:${mimeType};base64,${cleanedBase64}`;
    
    console.log('Sending to AI gateway...');
    
    // Use Gemini for OCR and categorization with enhanced prompt for date and items
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
            content: `Ti si asistent za analizu računa. Analiziraj sliku računa i izvuci SVE podatke:

1. Ukupni iznos (samo broj u eurima)
2. Naziv trgovine/usluge
3. Opis transakcije (kratko)
4. Kategorija: food, transport, shopping, entertainment, bills, health, other
5. DATUM računa - traži datum na računu (format: YYYY-MM-DD). Ako ne možeš pronaći, koristi null.
6. NAČIN PLAĆANJA - traži na računu:
   - "card" ako piše: VISA, MASTERCARD, MAESTRO, kartica, POS, AMEX, kartično plaćanje, bezgotovinski, contactless
   - "cash" ako piše: gotovina, GOTOV., uplaćeno, cash
   - null ako nije jasno
7. SVE artikle s računa - za svaki artikl izvuci:
   - name: naziv artikla
   - quantity: količina (broj, default 1)
   - unit_price: jedinična cijena ako postoji (broj ili null)
   - total_price: ukupna cijena artikla (broj)

Odgovori SAMO u JSON formatu:
{
  "amount": 45.50,
  "merchant": "Konzum",
  "description": "Tjedna kupovina namirnica",
  "category": "food",
  "date": "2025-01-20",
  "payment_method": "card",
  "items": [
    {"name": "Mlijeko 1L", "quantity": 2, "unit_price": 1.20, "total_price": 2.40},
    {"name": "Kruh", "quantity": 1, "unit_price": 1.50, "total_price": 1.50}
  ]
}

Ako ne možeš pročitati račun, vrati:
{
  "error": "Nije moguće pročitati račun"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analiziraj ovaj račun i izvuci sve podatke uključujući datum i artikle.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
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
    let receiptData;
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        receiptData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Nije moguće analizirati račun' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (receiptData.error) {
      return new Response(
        JSON.stringify({ error: receiptData.error }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsed receipt data:', receiptData);

    return new Response(
      JSON.stringify({
        amount: receiptData.amount,
        merchant: receiptData.merchant,
        description: receiptData.description,
        category: receiptData.category,
        date: receiptData.date || null,
        payment_method: receiptData.payment_method || null,
        items: receiptData.items || []
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
