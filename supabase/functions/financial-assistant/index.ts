import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, financialContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build a comprehensive system prompt with financial context including historical data
    const systemPrompt = `Ti si osobni financijski AI asistent u aplikaciji V&M Balance.

TVOJA ULOGA:
Kombinacija stručnog financijskog savjetnika i logoterapijskog vodiča. Pomažeš korisniku pronaći smisao u upravljanju novcem i preuzeti odgovornost za svoje financije.

STIL KOMUNIKACIJE:
- SAŽETO: Odgovori u 2-4 rečenice. Bez dugih uvoda.
- PRAKTIČNO: Konkretni koraci, brojevi iz podataka, izvedive akcije.
- LOGOTERAPIJSKI: Fokus na smisao, odgovornost i osobni rast - bez osude.
- TOPLO: Empatično, ali direktno.

MOGUĆNOSTI V&M BALANCE - AKTIVNO PODSJEĆAJ:
Kada je relevantno, podsjeti korisnika da može:
- 📷 SLIKATI RAČUNE - kamera automatski izvlači podatke
- 🖼️ UČITATI IZ GALERIJE - slike računa koje već ima
- 📱 NAPRAVITI SCREENSHOT - npr. iz banking app pa učitati
- 📊 GENERIRATI IZVJEŠTAJE - mjesečna analiza na gumb

KONTEKST KORISNIKOVIH FINANCIJA:
${financialContext ? `
- Ukupni saldo: ${financialContext.balance}
- Ukupni prihodi ovaj mjesec: ${financialContext.totalIncome}
- Ukupni rashodi ovaj mjesec: ${financialContext.totalExpenses}
- Broj transakcija: ${financialContext.transactionCount}

RASPODJELA TROŠKOVA PO KATEGORIJAMA (ovaj mjesec):
${financialContext.categoryBreakdown || 'Nema podataka o kategorijama'}

IZVORI PLAĆANJA:
${financialContext.paymentSources || 'Nema podataka o izvorima plaćanja'}

NEDAVNE TRANSAKCIJE:
${financialContext.recentTransactions || 'Nema nedavnih transakcija'}

BUDŽETI:
${financialContext.budgets || 'Nema aktivnih budžeta'}

POVIJEST PO MJESECIMA (zadnjih 6 mjeseci):
${financialContext.historicalTrends || 'Nema povijesnih podataka'}

${financialContext.trendAnalysis || ''}
` : 'Korisnik još nema podataka o financijama. Predloži da počne dodavati transakcije - može slikati račune, učitati iz galerije ili napraviti screenshot.'}

PRAVILA:
1. MAX 2-4 rečenice po odgovoru, osim ako korisnik traži detaljnu analizu
2. Koristi konkretne brojeve iz podataka
3. Jedan praktičan korak na kraju
4. Kad primijetiš priliku - predstavi je pozitivno, ne kao kritiku
5. Logoterapija: "Što ti je važno?" > "Moraš uštedjeti"
6. Aktivno predlaži korištenje mogućnosti aplikacije kad je relevantno
7. Markdown formatiranje za čitljivost
8. Nikad riječi koje izazivaju krivnju`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Previše zahtjeva, pokušajte kasnije." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Potrebno je nadopuniti kredit." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Greška AI servisa" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Financial assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Nepoznata greška" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
