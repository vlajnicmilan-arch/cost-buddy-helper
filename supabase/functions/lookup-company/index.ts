import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUDREG_API = "https://sudreg-data.gov.hr/api/javni";
const TOKEN_URL = `${SUDREG_API}/oauth/token`;

// Get OAuth2 token using client credentials
async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Token error:", response.status, errText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch from sudreg API endpoint
async function sudregFetch(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any[]> {
  const url = new URL(`${SUDREG_API}${endpoint}`);
  url.searchParams.set("no_data_error", "0");
  url.searchParams.set("omit_nulls", "0");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  console.log("Sudreg fetch:", url.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Sudreg ${endpoint} error:`, response.status, errText);
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// Search for a subject by OIB or name using the /subjekti endpoint
async function findSubject(query: string, token: string): Promise<any | null> {
  const isOIB = /^\d{11}$/.test(query.trim());

  // The sudreg API uses /subjekti for the main subjects table
  // We need to search through bulk data - try filtering
  if (isOIB) {
    // Search by OIB in subjekti table
    const subjects = await sudregFetch("/subjekti", token, {
      oib: query.trim(),
      limit: "5",
    });
    if (subjects.length > 0) return subjects[0];
  }

  // If OIB search didn't work or it's a name search, try tvrtke
  // The API is bulk-oriented, so we need to search differently
  // Try the /subjekti endpoint with filters
  const subjects = await sudregFetch("/subjekti", token, {
    ...(isOIB ? { oib: query.trim() } : {}),
    limit: "10",
  });

  if (isOIB && subjects.length > 0) {
    // Filter by OIB
    const match = subjects.find((s: any) => String(s.oib) === query.trim());
    if (match) return match;
  }

  return subjects.length > 0 ? subjects[0] : null;
}

// Get company details by MBS from multiple endpoints
async function getCompanyDetails(mbs: number, token: string) {
  const [tvrtke, sjedista, pravniOblici, emailAdrese] = await Promise.all([
    sudregFetch("/tvrtke", token, { mbs: String(mbs), limit: "1" }),
    sudregFetch("/sjedista", token, { mbs: String(mbs), limit: "1" }),
    sudregFetch("/pravni_oblici", token, { mbs: String(mbs), limit: "1", expand_relations: "1" }),
    sudregFetch("/email_adrese", token, { mbs: String(mbs), limit: "5" }),
  ]);

  return {
    tvrtka: tvrtke[0] || null,
    sjediste: sjedista[0] || null,
    pravniOblik: pravniOblici[0] || null,
    emails: emailAdrese,
  };
}

// Build structured company data from sudreg results
function buildCompanyData(subject: any, details: any): any {
  const { tvrtka, sjediste, pravniOblik, emails } = details;

  const address = sjediste
    ? [sjediste.ulica, sjediste.kucni_broj ? `${sjediste.kucni_broj}${sjediste.kucni_podbroj || ""}` : ""]
        .filter(Boolean)
        .join(" ")
    : "";

  const city = sjediste?.naziv_naselja || sjediste?.naselje_van_sifrarnika || "";
  const postalCode = sjediste?.postanski_broj ? String(sjediste.postanski_broj) : "";
  const county = sjediste?.naziv_zupanije || "";

  // Map sud_id_nadlezan to court name
  const courtMap: Record<number, string> = {
    1: "Trgovački sud u Zagrebu",
    2: "Trgovački sud u Splitu",
    3: "Trgovački sud u Rijeci",
    4: "Trgovački sud u Osijeku",
    5: "Trgovački sud u Varaždinu",
    6: "Trgovački sud u Zadru",
    7: "Trgovački sud u Bjelovaru",
    8: "Trgovački sud u Pazinu",
  };

  const legalFormName = pravniOblik?.pravni_oblik_naziv || pravniOblik?.naziv || "";
  const companyName = tvrtka?.ime || subject?.tvrtka || "";

  return {
    found: true,
    company_name: companyName,
    oib: subject?.oib ? String(subject.oib) : "",
    mbs: subject?.mbs ? String(subject.mbs) : "",
    address: address,
    city: city,
    postal_code: postalCode,
    country: "Hrvatska",
    legal_form: legalFormName,
    activity_code: "",
    activity_description: "",
    court_registry: courtMap[subject?.sud_id_nadlezan] || (subject?.sud_id_nadlezan ? `Sud ID: ${subject.sud_id_nadlezan}` : ""),
    is_vat_payer: false,
    iban: "",
    bank_name: "",
    email: emails.length > 0 ? emails[0].adresa || "" : "",
    phone: "",
    website: "",
    source: "sudreg",
  };
}

// Fallback: use AI to extract data (when sudreg API fails or for non-registered entities like obrti)
async function extractWithAI(query: string, lovableApiKey: string): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());
  const searchType = isOIB ? "OIB" : "naziv tvrtke";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Ti si AI asistent koji pomaže korisnicima popuniti podatke o njihovoj tvrtki u Hrvatskoj.
VAŽNA PRAVILA:
1. NIKADA ne izmišljaj podatke. Ako nisi 100% siguran, ostavi prazan string "".
2. OIB, MBS, IBAN - NIKADA ne izmišljaj!
3. Postavi found=true samo ako prepoznaješ tvrtku.
Korisnik traži prema: ${searchType}`,
        },
        { role: "user", content: `Pronađi podatke za: ${query.trim()}` },
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
                company_name: { type: "string" },
                oib: { type: "string" },
                address: { type: "string" },
                city: { type: "string" },
                postal_code: { type: "string" },
                country: { type: "string" },
                legal_form: { type: "string" },
                mbs: { type: "string" },
                court_registry: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                website: { type: "string" },
                found: { type: "boolean" },
                source: { type: "string" },
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
    if (response.status === 429) throw { status: 429, message: "Previše zahtjeva, pokušajte ponovno za minutu." };
    if (response.status === 402) throw { status: 402, message: "Nedovoljno kredita." };
    throw { status: 500, message: "AI gateway error" };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw { status: 500, message: "No data returned from AI" };

  const companyData = JSON.parse(toolCall.function.arguments);
  companyData.source = "ai";
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

    const SUDREG_CLIENT_ID = Deno.env.get("SUDREG_CLIENT_ID");
    const SUDREG_CLIENT_SECRET = Deno.env.get("SUDREG_CLIENT_SECRET");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Try official sudreg API first
    if (SUDREG_CLIENT_ID && SUDREG_CLIENT_SECRET) {
      try {
        console.log("Attempting official sudreg API lookup for:", query.trim());

        const token = await getAccessToken(SUDREG_CLIENT_ID, SUDREG_CLIENT_SECRET);
        console.log("Got sudreg access token");

        // First get subject list and find our target
        const isOIB = /^\d{11}$/.test(query.trim());
        
        // Fetch subjects - the API may support filtering
        let subjects: any[] = [];
        if (isOIB) {
          subjects = await sudregFetch("/subjekti", token, {
            oib: query.trim(),
            limit: "5",
          });
        }

        // If no OIB results, or searching by name, try broader search
        if (subjects.length === 0 && !isOIB) {
          // For name search, get all subjects and filter (API might not support name filter)
          // Instead, search tvrtke endpoint which has company names
          const tvrtke = await sudregFetch("/tvrtke", token, { limit: "1000" });
          const cleanQuery = query.trim().toLowerCase();
          const matchedTvrtka = tvrtke.find((t: any) => 
            t.ime?.toLowerCase().includes(cleanQuery) || 
            t.naznaka_imena?.toLowerCase().includes(cleanQuery)
          );
          
          if (matchedTvrtka) {
            // Found by name in tvrtke, now get full subject by MBS
            subjects = await sudregFetch("/subjekti", token, {
              mbs: String(matchedTvrtka.mbs),
              limit: "1",
            });
          }
        }

        if (subjects.length > 0) {
          const subject = isOIB
            ? subjects.find((s: any) => String(s.oib) === query.trim()) || subjects[0]
            : subjects[0];

          console.log("Found subject, MBS:", subject.mbs, "OIB:", subject.oib);

          // Get detailed info from related tables
          const details = await getCompanyDetails(subject.mbs, token);
          const companyData = buildCompanyData(subject, details);

          console.log("Company lookup result:", JSON.stringify(companyData));
          return new Response(JSON.stringify(companyData), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("No subject found in sudreg API, falling back to AI");
      } catch (e) {
        console.error("Sudreg API error:", e);
        console.log("Falling back to AI lookup");
      }
    } else {
      console.log("SUDREG credentials not configured, using AI-only lookup");
    }

    // Fallback to AI
    const companyData = await extractWithAI(query.trim(), LOVABLE_API_KEY);
    console.log("Company lookup result (AI):", JSON.stringify(companyData));

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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
