import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";
import { callGemini } from "../_shared/geminiClient.ts";
import { robustParseJson, logParseFailure } from "../_shared/jsonSalvage.ts";

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

    const __cap = await checkAiCostCap(auth.supabase);
    if (__cap) return __cap;
    const response = await callGemini({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Ti si analitičar bankovnih transakcija. Odgovaraj isključivo JSON arrayem." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      // Forsira čisti JSON output — nema markdown fenceova, nema reasoning leaka.
      // application/json prihvaća i array kao valjani root.
      response_format: { type: "json_object" as const },
      // Kod velikih batcheva (100+ transakcija) default limit zna odsjeći niz.
      max_tokens: 8192,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI API error: ${response.status}`);
    }
    recordAiCost(auth.supabase, "detect-loans").catch(() => {});

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    const finishReason = aiData.choices?.[0]?.finish_reason || null;

    // Obrambeno parsanje s podrškom za truncation. Root je ARRAY.
    const parsed = robustParseJson<any[]>(content, "array");
    let loans: any[] = [];
    if (parsed && Array.isArray(parsed.value)) {
      loans = parsed.value;
      if (parsed.mode !== "clean") {
        console.warn("detect-loans: JSON parsed via fallback mode:", parsed.mode, "finish_reason:", finishReason);
      }
    } else {
      console.error("detect-loans: failed to parse AI JSON", { finishReason, contentLength: content.length, tail: content.slice(-200) });
      void logParseFailure("detect_loans_failed", auth.userId, {
        cause: finishReason === "length" ? "truncated" : "no-json",
        finish_reason: finishReason,
        content_length: content.length,
        tail: content.slice(-200),
      });
    }

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
