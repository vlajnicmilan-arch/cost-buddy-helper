import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";
import { callGemini } from "../_shared/geminiClient.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;

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

    const quota = await checkAiQuota(auth.supabase, auth.userId, "match-recurring");
    if (quota) return quota;


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
- confidence: "high" ako su opis i iznos identični, "medium" ako je semantički match ali isti iznos

STROGA PRAVILA — NE SMIJEŠ KRŠITI:
1. Iznos MORA biti IDENTIČAN. Npr. 9.86 ≠ 5.00, 0.40 ≠ 0.21. Čak i mala razlika znači da NIJE match.
2. Tip (expense/income) MORA se poklapati. Expense ≠ income.
3. Opis mora semantički odgovarati — mora postojati logička veza između opisa transakcije i ponavljajuće obveze.
4. Ako nisi 100% siguran, NE matchaj. Vrati prazan array []. Bolje je propustiti 10 točnih matcheva nego dati 1 krivi.
5. Svaka transakcija može matchati najviše jednu ponavljajuću obvezu.

PRIMJERI KOJI NISU MATCH:
- "Osiguranje kredita" (9.86€) i "Parking" (5.00€) → NIJE match (različit iznos i opis)
- "Naknada za trajni nalog" (0.40€) i "Naknada" (0.21€) → NIJE match (različit iznos)
- "Režije" (150€) i "Režije" (145€) → NIJE match (različit iznos)

PRIMJERI KOJI JESU MATCH:
- "Stanarina" (350.00€) i "Najam stana" (350.00€) → JEST match (identičan iznos, semantički sličan opis)
- "Netflix" (13.99€) i "Netflix pretplata" (13.99€) → JEST match (identičan iznos, isti servis)

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
          { role: "system", content: "Ti si precizan analitičar financijskih transakcija. Odgovaraš isključivo JSON arrayem. NIKADA ne haluciniraj — koristi SAMO podatke koji su ti dani. Ako iznosi nisu identični, to NIJE match. Bolje je vratiti prazan array nego dati krivi match." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
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
