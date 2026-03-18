import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Step 1: Search sudreg via Firecrawl
async function searchSudreg(query: string, apiKey: string): Promise<string | null> {
  try {
    const isOIB = /^\d{11}$/.test(query.trim());
    const searchQuery = isOIB
      ? `site:sudreg.pravosudje.hr OIB ${query.trim()}`
      : `site:sudreg.pravosudje.hr "${query.trim()}"`;

    console.log("Firecrawl search query:", searchQuery);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Firecrawl search error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    console.log("Firecrawl search results count:", data?.data?.length || 0);

    const contents: string[] = [];
    if (data?.data && Array.isArray(data.data)) {
      for (const result of data.data) {
        if (result.markdown) {
          contents.push(result.markdown);
        }
      }
    }

    if (contents.length === 0) return null;
    return contents.join("\n\n---\n\n").slice(0, 8000);
  } catch (e) {
    console.error("Firecrawl search exception:", e);
    return null;
  }
}

// Step 2: Try scraping sudreg detail page directly (new ORDS URL pattern)
async function scrapeSudregDirect(query: string, apiKey: string): Promise<string | null> {
  try {
    const isOIB = /^\d{11}$/.test(query.trim());
    
    // New ORDS-based URL pattern for sudreg
    const searchUrl = isOIB
      ? `https://sudreg.pravosudje.hr/ords/r/esudreg/public/pretraga?p28_sbt_oib=${query.trim()}`
      : `https://sudreg.pravosudje.hr/ords/r/esudreg/public/pretraga?p28_sbt_naziv=${encodeURIComponent(query.trim())}`;

    console.log("Firecrawl scrape URL:", searchUrl);

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ["markdown"],
        waitFor: 5000, // APEX needs more time to render
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Firecrawl scrape error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || data?.markdown;
    if (!markdown || markdown.length < 50) return null;

    console.log("Firecrawl scrape content length:", markdown.length);
    return markdown.slice(0, 8000);
  } catch (e) {
    console.error("Firecrawl scrape exception:", e);
    return null;
  }
}

// Step 2b: Also try a general web search as fallback
async function webSearchFallback(query: string, apiKey: string): Promise<string | null> {
  try {
    const searchQuery = `"${query.trim()}" OIB adresa Hrvatska`;
    console.log("Firecrawl web fallback search:", searchQuery);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 3,
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
    return contents.join("\n\n---\n\n").slice(0, 6000);
  } catch (e) {
    console.error("Web search fallback exception:", e);
    return null;
  }
}

// Step 3: Use AI to extract structured data from scraped content
async function extractWithAI(
  query: string,
  scrapedContent: string | null,
  lovableApiKey: string
): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());
  const searchType = isOIB ? "OIB" : "naziv tvrtke";

  const hasScrapedData = scrapedContent && scrapedContent.length > 100;

  const systemPrompt = hasScrapedData
    ? `Ti si AI asistent koji izvlači strukturirane podatke o tvrtkama iz sadržaja sudskog registra RH.

PRAVILA:
1. Analiziraj SAMO podatke iz priloženog sadržaja sudskog registra.
2. Izvuci sve dostupne podatke: naziv, OIB, MBS, adresu, pravni oblik, djelatnost, sud, itd.
3. Ako neki podatak NIJE u priloženom sadržaju, ostavi ga kao prazan string "".
4. NIKADA ne izmišljaj podatke koji nisu u priloženom tekstu.
5. Postavi found=true ako si pronašao relevantne podatke o tvrtki.

Korisnik traži podatke prema: ${searchType}`
    : `Ti si AI asistent koji pomaže korisnicima popuniti podatke o njihovoj tvrtki u Hrvatskoj.

VAŽNA PRAVILA:
1. NIKADA ne izmišljaj podatke. Ako nisi 100% siguran u neki podatak, OBAVEZNO ga ostavi kao prazan string "".
2. Za poznate velike tvrtke možeš popuniti javno poznate podatke.
3. Za manje/nepoznate tvrtke, popuni SAMO ono što možeš sigurno zaključiti iz naziva.
4. OIB, MBS, IBAN - NIKADA ne izmišljaj! Ostavi prazno ako ne znaš točan podatak.
5. Postavi found=true ako prepoznaješ tvrtku ili možeš izvući barem pravni oblik iz naziva.

Korisnik traži podatke prema: ${searchType}`;

  const userMessage = hasScrapedData
    ? `Izvuci podatke za: ${query.trim()}\n\nSadržaj iz sudskog registra:\n${scrapedContent}`
    : `Pronađi podatke za: ${query.trim()}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_company_data",
            description:
              "Return structured company data extracted from court register content. Leave unknown fields as empty string.",
            parameters: {
              type: "object",
              properties: {
                company_name: { type: "string", description: "Puni službeni naziv tvrtke s pravnim oblikom" },
                oib: { type: "string", description: "OIB (točno 11 znamenki). MORA biti iz sadržaja ili prazan." },
                address: { type: "string", description: "Ulica i kućni broj" },
                city: { type: "string", description: "Grad sjedišta" },
                postal_code: { type: "string", description: "Poštanski broj" },
                country: { type: "string", description: "Država, default Hrvatska" },
                legal_form: { type: "string", description: "Pravni oblik: d.o.o., j.d.o.o., d.d., obrt, udruga, etc." },
                activity_code: { type: "string", description: "NKD 2007 šifra djelatnosti (npr. 62.01)" },
                activity_description: { type: "string", description: "Opis glavne djelatnosti" },
                mbs: { type: "string", description: "Matični broj subjekta iz sudskog registra" },
                court_registry: { type: "string", description: "Nadležni trgovački sud" },
                is_vat_payer: { type: "boolean", description: "true ako je PDV obveznik" },
                iban: { type: "string", description: "IBAN. MORA biti iz sadržaja ili prazan." },
                bank_name: { type: "string", description: "Naziv banke" },
                email: { type: "string", description: "Službeni email" },
                phone: { type: "string", description: "Telefon" },
                website: { type: "string", description: "Web stranica" },
                found: { type: "boolean", description: "true ako su pronađeni podaci o tvrtki" },
                source: { type: "string", description: "Izvor podataka: 'sudreg' ili 'ai'" },
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
    if (response.status === 429) {
      throw { status: 429, message: "Previše zahtjeva, pokušajte ponovno za minutu." };
    }
    if (response.status === 402) {
      throw { status: 402, message: "Nedovoljno kredita." };
    }
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    throw { status: 500, message: "AI gateway error" };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    throw { status: 500, message: "No data returned from AI" };
  }

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

    // Try Firecrawl if available
    if (FIRECRAWL_API_KEY) {
      console.log("Attempting Firecrawl lookup for:", query.trim());

      // Try search and direct scrape in parallel
      const [searchResult, scrapeResult] = await Promise.all([
        searchSudreg(query.trim(), FIRECRAWL_API_KEY),
        scrapeSudregDirect(query.trim(), FIRECRAWL_API_KEY),
      ]);

      // Prefer direct scrape (more detailed), fallback to search
      scrapedContent = scrapeResult || searchResult;

      // If sudreg didn't return results, try general web search
      if (!scrapedContent) {
        console.log("No sudreg content, trying web search fallback...");
        scrapedContent = await webSearchFallback(query.trim(), FIRECRAWL_API_KEY);
      }

      if (scrapedContent) {
        console.log("Got scraped content, length:", scrapedContent.length);
      } else {
        console.log("No content found, falling back to AI-only");
      }
    } else {
      console.log("FIRECRAWL_API_KEY not configured, using AI-only lookup");
    }

    // Extract structured data using AI (with or without scraped content)
    const companyData = await extractWithAI(query.trim(), scrapedContent, LOVABLE_API_KEY);
    console.log("Company lookup result:", JSON.stringify(companyData));

    return new Response(JSON.stringify(companyData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("lookup-company error:", e);

    if (e.status === 429 || e.status === 402) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : e.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
