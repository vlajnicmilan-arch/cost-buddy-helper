import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Query too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isOIB = /^\d{11}$/.test(query.trim());
    const searchType = isOIB ? "OIB" : "naziv tvrtke";

    const systemPrompt = `Ti si AI asistent koji pomaže korisnicima popuniti podatke o njihovoj tvrtki u Hrvatskoj.

VAŽNA PRAVILA:
1. NIKADA ne izmišljaj podatke. Ako nisi 100% siguran u neki podatak, OBAVEZNO ga ostavi kao prazan string "".
2. Za poznate velike tvrtke (npr. Rimac, HT, INA, Konzum, Podravka) možeš popuniti javno poznate podatke.
3. Za manje/nepoznate tvrtke, popuni SAMO ono što možeš sigurno zaključiti iz naziva:
   - Pravni oblik (d.o.o., d.d., j.d.o.o., obrt) - iz naziva tvrtke
   - Država: "Hrvatska" (ako je hrvatska tvrtka)
   - Sve ostalo ostavi prazno ako nisi siguran
4. OIB, MBS, IBAN - NIKADA ne izmišljaj! Ostavi prazno ako ne znaš točan podatak.
5. Adresu, telefon, email, web - popuni SAMO ako si siguran (javno poznate tvrtke).
6. Šifru djelatnosti (NKD) - popuni samo ako je očito iz naziva tvrtke (npr. "... Građevinarstvo d.o.o." → 41.20).
7. PDV obveznik - postavi true samo za tvrtke za koje sigurno znaš, inače false.
8. Postavi found=true ako prepoznaješ tvrtku ili možeš izvući barem pravni oblik iz naziva.
   Postavi found=false SAMO ako upit nema smisla.

Korisnik traži podatke prema: ${searchType}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Pronađi podatke za: ${query.trim()}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_company_data",
              description: "Return structured company data. Leave unknown fields as empty string. NEVER fabricate data.",
              parameters: {
                type: "object",
                properties: {
                  company_name: { type: "string", description: "Puni službeni naziv tvrtke s pravnim oblikom. Prazno ako nepoznato." },
                  oib: { type: "string", description: "OIB (točno 11 znamenki). MORA biti točan ili prazan string." },
                  address: { type: "string", description: "Ulica i kućni broj. Prazan string ako nepoznato." },
                  city: { type: "string", description: "Grad sjedišta. Prazan string ako nepoznato." },
                  postal_code: { type: "string", description: "Poštanski broj. Prazan string ako nepoznato." },
                  country: { type: "string", description: "Država, default Hrvatska" },
                  legal_form: { type: "string", description: "Pravni oblik: d.o.o., j.d.o.o., d.d., obrt, udruga, etc." },
                  activity_code: { type: "string", description: "NKD 2007 šifra djelatnosti (npr. 62.01). Prazan string ako nepoznato." },
                  activity_description: { type: "string", description: "Opis glavne djelatnosti. Prazan string ako nepoznato." },
                  mbs: { type: "string", description: "Matični broj subjekta iz sudskog registra. MORA biti točan ili prazan string." },
                  court_registry: { type: "string", description: "Nadležni trgovački sud. Prazan string ako nepoznato." },
                  is_vat_payer: { type: "boolean", description: "true samo ako je sigurno PDV obveznik, inače false" },
                  iban: { type: "string", description: "IBAN u HR formatu. MORA biti točan ili prazan string. NIKADA ne izmišljaj." },
                  bank_name: { type: "string", description: "Naziv banke. Prazan string ako nepoznato." },
                  email: { type: "string", description: "Službeni email. Prazan string ako nepoznato." },
                  phone: { type: "string", description: "Telefon. Prazan string ako nepoznato." },
                  website: { type: "string", description: "Web stranica. Prazan string ako nepoznato." },
                  found: { type: "boolean", description: "true ako je tvrtka prepoznata ili se barem može zaključiti pravni oblik" }
                },
                required: ["found", "company_name"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_company_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Previše zahtjeva, pokušajte ponovno za minutu." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Nedovoljno kredita." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No data returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyData = JSON.parse(toolCall.function.arguments);
    console.log("Company lookup result:", JSON.stringify(companyData));

    return new Response(JSON.stringify(companyData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lookup-company error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
