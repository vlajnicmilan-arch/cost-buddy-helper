import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchCompanySources(
  query: string,
  apiKey: string,
): Promise<{ content: string | null; source: "sudreg" | "web" }> {
  const trimmedQuery = query.trim();
  const isOIB = /^\d{11}$/.test(trimmedQuery);
  const searches: Array<{ source: "sudreg" | "web"; query: string; limit: number }> = [
    {
      source: "sudreg",
      query: isOIB
        ? `site:sudreg.pravosudje.hr OIB ${trimmedQuery}`
        : `site:sudreg.pravosudje.hr "${trimmedQuery}"`,
      limit: 2,
    },
    {
      source: "web",
      query: isOIB
        ? `"${trimmedQuery}" OIB adresa kontakt tvrtka`
        : `"${trimmedQuery}" OIB adresa kontakt`,
      limit: 3,
    },
  ];

  for (const search of searches) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: search.query,
          limit: search.limit,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const contents: string[] = [];
      if (data?.data && Array.isArray(data.data)) {
        for (const result of data.data) {
          if (result.markdown) contents.push(result.markdown);
        }
      }

      if (contents.length > 0) {
        return {
          content: contents.join("\n\n---\n\n").slice(0, 7000),
          source: search.source,
        };
      }
    } catch (e) {
      console.error(`Firecrawl ${search.source} search exception:`, e);
    }
  }

  return { content: null, source: "sudreg" };
}

async function extractWithAI(
  query: string,
  scrapedContent: string,
  lovableApiKey: string,
  source: "sudreg" | "web"
): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());
  const searchType = isOIB ? "OIB" : "naziv tvrtke";

  const systemPrompt = `Izvuci strukturirane podatke o tvrtki iz javno dostupnih izvora. Prioritet daj službenim registrima i službenim stranicama tvrtke. Ako podatak NIJE izričito u tekstu, ostavi prazan string \"\". NIKADA ne izmišljaj. Postavi found=true SAMO ako pronađeš barem jedan konkretan podatak osim samog naziva. Korisnik traži po: ${searchType}`;

  const userMessage = `Izvuci sve moguće podatke za tvrtku \"${query.trim()}\" iz sljedećeg sadržaja. found=true samo ako postoji barem jedan konkretan podatak osim naziva.\n\nSadržaj:\n${scrapedContent}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_company_data",
            description: "Return structured company data. Leave unknown fields as empty string.",
            parameters: {
              type: "object",
              properties: {
                company_name: { type: "string", description: "Puni službeni naziv tvrtke" },
                oib: { type: "string", description: "OIB (11 znamenki) ili prazan" },
                address: { type: "string", description: "Ulica i kućni broj" },
                city: { type: "string", description: "Grad" },
                postal_code: { type: "string", description: "Poštanski broj" },
                country: { type: "string", description: "Država" },
                legal_form: { type: "string", description: "Pravni oblik" },
                activity_code: { type: "string", description: "NKD šifra" },
                activity_description: { type: "string", description: "Opis djelatnosti" },
                mbs: { type: "string", description: "Matični broj subjekta" },
                court_registry: { type: "string", description: "Nadležni sud" },
                is_vat_payer: { type: "boolean", description: "PDV obveznik" },
                iban: { type: "string", description: "IBAN ili prazan" },
                bank_name: { type: "string", description: "Naziv banke" },
                email: { type: "string", description: "Email" },
                phone: { type: "string", description: "Telefon" },
                website: { type: "string", description: "Web" },
                found: { type: "boolean", description: "true samo ako postoji barem jedan konkretan podatak osim naziva" },
                source: { type: "string", description: "'sudreg' ili 'web'" },
              },
              required: ["found", "company_name", "source"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_company_data" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw { status: 429, message: "Previše zahtjeva." };
    if (response.status === 402) throw { status: 402, message: "Nedovoljno kredita." };
    throw { status: 500, message: "AI gateway error" };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw { status: 500, message: "No data returned from AI" };

  const companyData = JSON.parse(toolCall.function.arguments);
  const usefulFields = [
    companyData.oib,
    companyData.address,
    companyData.city,
    companyData.postal_code,
    companyData.email,
    companyData.phone,
    companyData.mbs,
    companyData.court_registry,
    companyData.activity_code,
    companyData.activity_description,
    companyData.website,
    companyData.iban,
    companyData.bank_name,
  ];
  companyData.found = usefulFields.some((value) => typeof value === "string" ? value.trim().length > 0 : Boolean(value));
  companyData.source = "sudreg";
  return companyData;
}

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

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    let scrapedContent: string | null = null;
    if (FIRECRAWL_API_KEY) {
      scrapedContent = await searchSudreg(query.trim(), FIRECRAWL_API_KEY);
    }

    if (!scrapedContent) {
      return new Response(JSON.stringify({
        found: false,
        source: "sudreg",
        company_name: query.trim(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyData = await extractWithAI(query.trim(), scrapedContent, LOVABLE_API_KEY);

    return new Response(JSON.stringify(companyData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("lookup-company error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      {
        status: e.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
