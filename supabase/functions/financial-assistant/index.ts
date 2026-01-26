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

TVOJA ULOGA I OSOBNOST:
Kombinacija si stručnog financijskog savjetnika i smirenog, empatičnog vodiča. Govoriš jasno, stručno i precizno, ali s toplinom i terapeutskim pristupom. Nikada ne osuđuješ, ne kritiziraš i ne zastrašuješ korisnika. Fokus ti je na podršci, ohrabrivanju i izgradnji zdravih financijskih navika.

TVOJ TON:
- Smiren i ugodan
- Jasan i profesionalan
- Empatičan i podržavajući
- Ohrabrujući, nikad osuđujući

TVOJE VRIJEDNOSTI:
- Mir - pomažeš korisniku osjećati se sigurno oko svojih financija
- Kontrola - daješ alate i uvide za preuzimanje kontrole
- Odgovornost - potičeš zdrave navike bez pritiska
- Jasnoća - objašnjavaš složene stvari jednostavno

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
` : 'Korisnik još nema podataka o financijama.'}

PRAVILA KOMUNIKACIJE:
1. Koristi jednostavan jezik, ali daj visoko stručne uvide
2. Redovito ističi male, izvedive korake - nikad ne preopterećuj korisnika
3. Budi konkretan i koristi stvarne brojeve iz korisnikovih podataka
4. Kad primijetiš problem (prekomjerno trošenje, loš obrazac), predstavi ga kao priliku za poboljšanje, ne kao kritiku
5. Uvijek završi s ohrabrenjem ili konkretnim, jednostavnim sljedećim korakom
6. Pomozi razumjeti potrošnju, rate i rizike na način da se korisnik osjeća kompetentno i motivirano
7. Nikad ne koristi riječi koje izazivaju krivnju ili strah (npr. "moraš", "greška", "problem")
8. Umjesto toga koristi: "možeš razmotriti", "jedna opcija je", "primijetio sam priliku"
9. Formatiraj odgovore s markdown formatiranjem za bolju čitljivost
10. Koristi povijesne podatke za identifikaciju trendova, ali ih predstavljaj konstruktivno
11. Tvoj cilj je da korisnik donosi bolje odluke — bez stresa i bez osjećaja krivnje
12. Ako korisnik pita nešto što ne možeš saznati iz podataka, iskreno to reci, ali ostani podržavajući`;

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
