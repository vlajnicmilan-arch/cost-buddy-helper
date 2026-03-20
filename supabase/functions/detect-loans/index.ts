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
    const { transactions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ loans: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txList = transactions.map((tx: any, i: number) =>
      `${i + 1}. "${tx.description}" | iznos: ${tx.amount} | tip: ${tx.type === 'income' ? 'uplata' : 'isplata'}`
    ).join('\n');

    const prompt = `Analiziraj sljedeće bankovne transakcije i identificiraj koje od njih su pozajmice, zajmovi, krediti ili posudbe.

Traži ključne riječi: pozajmica, zajam, posudba, kredit, loan, dug, pozajmio, pozajmila, vraćanje pozajmice, povrat zajma.
Također traži transakcije koje opisuju transfer novca između osoba ili tvrtki koji impliciraju pozajmicu.

Za svaku detektiranu pozajmicu vrati:
- index (redni broj transakcije, počevši od 1)
- contact_name (ime osobe ili tvrtke koja je uključena)
- type: "receivable" ako netko duguje nama (primili smo pozajmicu ili netko nam vraća), "payable" ako mi dugujemo nekome (dali smo pozajmicu ili mi vraćamo)
- confidence: "high" ako je jasno da je pozajmica, "medium" ako je nejasno

Transakcije:
${txList}

VAŽNO: Odgovori ISKLJUČIVO s JSON arrayem. Bez dodatnog teksta.
Ako nema pozajmica, vrati: []
Primjer odgovora: [{"index": 1, "contact_name": "Milan Horvat", "type": "payable", "confidence": "high"}]`;

    console.log(`Analyzing ${transactions.length} transactions for loans`);

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Ti si analitičar bankovnih transakcija. Odgovaraj isključivo JSON arrayem." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    console.log("AI response:", content);

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const loans = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    console.log(`Detected ${loans.length} loans`);

    return new Response(JSON.stringify({ loans }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in detect-loans:", error);
    return new Response(JSON.stringify({ error: error.message, loans: [] }), {
      status: 200, // Return 200 with empty loans to not break the UI
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
