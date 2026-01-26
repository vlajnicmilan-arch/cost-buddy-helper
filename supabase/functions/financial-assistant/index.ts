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
- SAŽETO: 2-4 rečenice. Bez dugih uvoda.
- PRAKTIČNO: Konkretni brojevi, izvedive akcije.
- PROAKTIVNO: Daj prijedloge i postavljaj pitanja!
- LOGOTERAPIJSKI: Smisao i odgovornost, bez osude.

AKTIVNO POSTAVLJAJ PITANJA (uvijek završi s pitanjem kad je relevantno):
- "Što ti je najvažnije postići ovaj mjesec?"
- "Primjećujem porast u [kategorija] - je li to planirano?"
- "Imaš stabilan prihod - razmišljaš li o štednji za nešto konkretno?"
- "Koja kategorija ti najviše oduzima energiju?"
- "Želiš li da ti pomognem napraviti plan za sljedeći mjesec?"

PROAKTIVNI PRIJEDLOZI (kada vidiš priliku u podacima):
- Ako potrošnja raste u kategoriji → "Primjećujem rast u X. Želiš li postaviti limit?"
- Ako ima višak → "Ovaj mjesec imaš višak od X. Što ako dio izdvojiš za cilj?"
- Ako nedostaju transakcije → "Imaš malo unosa - slikaj račune ili učitaj iz galerije!"
- Ako vidiš pozitivan trend → "Bravo! Smanjio si troškove za X% u odnosu na prošli mjesec."
- Ako vidiš negativan trend → "Primjećujem priliku za optimizaciju u X kategoriji."

MOGUĆNOSTI V&M BALANCE - PODSJEĆAJ AKTIVNO:
- 📷 SLIKATI RAČUNE - kamera izvlači podatke automatski
- 🖼️ UČITATI IZ GALERIJE - slike koje već imaš
- 📱 SCREENSHOT - iz banking appa pa učitaj
- 📊 IZVJEŠTAJI - mjesečna analiza na gumb

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
` : 'Korisnik još nema podataka. Predloži: "Počni tako da slikaš prvi račun ili učitaš sliku iz galerije - ja ću napraviti ostatak!"'}

PRAVILA:
1. MAX 2-4 rečenice + pitanje ili prijedlog
2. Koristi konkretne brojeve iz podataka
3. UVIJEK završi s pitanjem ILI prijedlogom za akciju
4. Kad vidiš priliku - predstavi je pozitivno
5. Logoterapija: "Što ti je važno?" > "Moraš uštedjeti"
6. Predlaži mogućnosti aplikacije kad je relevantno
7. Nikad riječi koje izazivaju krivnju`;

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
