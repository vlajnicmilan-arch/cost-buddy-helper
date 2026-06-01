import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";

function getTransactionDirection(tx: { amount: number; type?: string }) {
  const amount = Number(tx.amount);

  if (Number.isFinite(amount) && amount !== 0) {
    return amount > 0 ? "uplata" : "isplata";
  }

  if (tx.type === "income") return "uplata";
  if (tx.type === "expense") return "isplata";

  return "nepoznato";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;

    const { transactions } = await req.json();

    // Quota check (only if there's actually work to do)
    if (transactions && transactions.length > 0) {
      const quota = await checkAiQuota(auth.supabase, auth.userId, "detect-loans");
      if (quota) return quota;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ loans: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txList = transactions
      .map((tx: any, i: number) => {
        const direction = getTransactionDirection(tx);
        return `${i + 1}. "${tx.description}" | iznos: ${tx.amount} | smjer: ${direction} | iznos_pozitivan: ${Number(tx.amount) > 0 ? 'da' : 'ne'}`;
      })
      .join("\n");

    const prompt = `Analiziraj sljedeće bankovne transakcije i identificiraj koje od njih su pozajmice, zajmovi, krediti ili posudbe.

Traži ključne riječi: pozajmica, zajam, posudba, kredit, loan, dug, pozajmio, pozajmila, vraćanje pozajmice, povrat zajma.
Također traži transakcije koje opisuju transfer novca između osoba ili tvrtki koji impliciraju pozajmicu.

VAŽNO ZA SMJER TRANSAKCIJE:
- pozitivan iznos znači uplata na račun
- negativan iznos znači isplata s računa
- ako se tekstualni tip i iznos ne slažu, vjeruj PREDZNAKU iznosa

Za svaku detektiranu pozajmicu vrati:
- index (redni broj transakcije, počevši od 1)
- contact_name (ime osobe ili tvrtke koja je uključena)
- type: "receivable" ako netko duguje nama, "payable" ako mi dugujemo nekome
- confidence: "high" ako je jasno da je pozajmica, "medium" ako je nejasno

Transakcije:
${txList}

VAŽNO: Odgovori ISKLJUČIVO s JSON arrayem. Bez dodatnog teksta.
Ako nema pozajmica, vrati: []
Primjer odgovora: [{"index": 1, "contact_name": "Milan Horvat", "type": "payable", "confidence": "high"}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const loans = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return new Response(JSON.stringify({ loans }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in detect-loans:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        loans: [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
