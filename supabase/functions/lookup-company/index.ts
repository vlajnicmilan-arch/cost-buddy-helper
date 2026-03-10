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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Ti si stručnjak za hrvatske poslovne registre. Korisnik će ti dati ${searchType} tvrtke registrirane u Hrvatskoj. Na temelju svog znanja, pronađi i vrati sve dostupne podatke o toj tvrtki. Budi što precizniji. Ako nisi siguran u neki podatak, ostavi ga praznim. Za OIB koristi format bez crtica. Za IBAN koristi HR format.`
          },
          {
            role: "user",
            content: `Pronađi podatke za hrvatsku tvrtku: ${query.trim()}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_company_data",
              description: "Return structured company data found for the query",
              parameters: {
                type: "object",
                properties: {
                  company_name: { type: "string", description: "Puni naziv tvrtke" },
                  oib: { type: "string", description: "OIB (11 znamenki)" },
                  address: { type: "string", description: "Ulica i kućni broj" },
                  city: { type: "string", description: "Grad" },
                  postal_code: { type: "string", description: "Poštanski broj" },
                  country: { type: "string", description: "Država" },
                  legal_form: { type: "string", description: "Pravni oblik (d.o.o., j.d.o.o., d.d., obrt)" },
                  activity_code: { type: "string", description: "NKD šifra djelatnosti" },
                  activity_description: { type: "string", description: "Opis djelatnosti" },
                  mbs: { type: "string", description: "Matični broj subjekta" },
                  court_registry: { type: "string", description: "Trgovački sud" },
                  is_vat_payer: { type: "boolean", description: "Je li PDV obveznik" },
                  iban: { type: "string", description: "IBAN" },
                  bank_name: { type: "string", description: "Naziv banke" },
                  email: { type: "string", description: "Email" },
                  phone: { type: "string", description: "Telefon" },
                  website: { type: "string", description: "Web stranica" },
                  found: { type: "boolean", description: "Je li tvrtka pronađena" }
                },
                required: ["found"],
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
