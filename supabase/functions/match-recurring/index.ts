import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, recurringTransactions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!transactions?.length || !recurringTransactions?.length) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txList = transactions
      .map((tx: any, i: number) => `${i + 1}. "${tx.description}" | iznos: ${tx.amount} | tip: ${tx.type} | datum: ${tx.date}`)
      .join("\n");

    const recList = recurringTransactions
      .map((r: any, i: number) => `${i + 1}. "${r.description}" | iznos: ${r.amount} | tip: ${r.type} | frekvencija: ${r.frequency} | sljedeći rok: ${r.next_due_date}${r.merchant_name ? ` | trgovac: ${r.merchant_name}` : ''}`)
      .join("\n");

    const prompt = `Analiziraj transakcije i pronađi koje odgovaraju ponavljajućim obvezama.

TRANSAKCIJE:
${txList}

PONAVLJAJUĆE OBVEZE:
${recList}

Za svaki match vrati:
- transaction_index (redni broj transakcije, 1-based)
- recurring_index (redni broj ponavljajuće obveze, 1-based)  
- confidence: "high" ako su opis i iznos gotovo identični, "medium" ako je semantički match

Pravila:
- Iznos mora biti identičan ili vrlo blizu (±5%)
- Tip (expense/income) mora se poklapati
- Opis ne mora biti identičan ali mora semantički odgovarati (npr. "Stanarina" = "Najam stana" = "Rent Leko")
- Datum bi trebao biti blizu next_due_date (±10 dana), ali nije obavezan
- Svaka transakcija može matchati najviše jednu ponavljajuću obvezu

VAŽNO: Odgovori ISKLJUČIVO s JSON arrayem. Bez dodatnog teksta.
Ako nema matcheva, vrati: []
Primjer: [{"transaction_index": 1, "recurring_index": 2, "confidence": "high"}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Ti si analitičar financijskih transakcija. Odgovaraj isključivo JSON arrayem." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded", matches: [] }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted", matches: [] }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const matches = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in match-recurring:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        matches: [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
