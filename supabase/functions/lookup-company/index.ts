import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchSudreg(query: string, apiKey: string): Promise<string | null> {
  try {
    const isOIB = /^\d{11}$/.test(query.trim());
    const searchQuery = isOIB
      ? `site:sudreg.pravosudje.hr OIB ${query.trim()}`
      : `site:sudreg.pravosudje.hr "${query.trim()}"`;

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 2,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const contents: string[] = [];
    if (data?.data && Array.isArray(data.data)) {
      for (const result of data.data) {
        if (result.markdown) contents.push(result.markdown);
      }
    }

    if (contents.length === 0) return null;
    return contents.join("\n\n---\n\n").slice(0, 5000);
  } catch (e) {
    console.error("Firecrawl search exception:", e);
    return null;
  }
}

async function extractWithAI(
  query: string,
  scrapedContent: string | null,
  lovableApiKey: string
): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());
  const searchType = isOIB ? "OIB" : "naziv tvrtke";
  const hasScrapedData = scrapedContent && scrapedContent.length > 100;

  const systemPrompt = hasScrapedData
    ? `Izvuci strukturirane podatke o tvrtki iz sadržaja sudskog registra RH. Ako podatak NIJE u tekstu, ostavi prazan string. NIKADA ne izmišljaj. Korisnik traži po: ${searchType}`
    : `Pomozi popuniti podatke o tvrtki u HR. NIKADA ne izmišljaj OIB/MBS/IBAN. Za poznate tvrtke popuni javno poznate podatke. Korisnik traži po: ${searchType}`;

  const userMessage = hasScrapedData
    ? `Izvuci podatke za: ${query.trim()}\n\nSadržaj:\n${scrapedContent}`
    : `Pronađi podatke za: ${query.trim()}`;

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
                found: { type: "boolean", description: "true ako pronađeni podaci" },
                source: { type: "string", description: "'sudreg' ili 'ai'" },
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
  companyData.source = hasScrapedData ? "sudreg" : "ai";
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
