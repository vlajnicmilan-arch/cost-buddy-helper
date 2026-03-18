import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUDREG_API = "https://sudreg-data.gov.hr/api/javni";
const TOKEN_URL = "https://sudreg-data.gov.hr/api/oauth/token";

// Get OAuth2 token using client credentials (HTTP Basic Auth)
async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Token error:", response.status, errText.slice(0, 500));
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  console.log("Token obtained, expires_in:", data.expires_in);
  return data.access_token;
}

// Fetch from sudreg API
async function sudregFetch(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any> {
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
    console.error(`Sudreg ${endpoint} error:`, response.status, errText.slice(0, 300));
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

// Find subject by OIB - search through /subjekti with pagination
async function findSubjectByOIB(oib: string, token: string): Promise<any | null> {
  // The /subjekti endpoint is bulk - we need to scan for OIB
  // Try first 5000 subjects (5 pages of 1000)
  for (let offset = 0; offset < 5000; offset += 1000) {
    const subjects = await sudregFetch("/subjekti", token, {
      only_active: "1",
      limit: "1000",
      offset: String(offset),
    });
    
    if (!Array.isArray(subjects) || subjects.length === 0) break;
    
    const match = subjects.find((s: any) => {
      const subjectOib = String(s.oib || "").padStart(11, "0");
      return subjectOib === oib.padStart(11, "0");
    });
    
    if (match) return match;
  }
  
  return null;
}

// Find subject by name - use tvrtka_naziv filter on /subjekti
async function findSubjectByName(name: string, token: string): Promise<any | null> {
  // Clean the name for search
  const cleanName = name
    .replace(/\b(d\.o\.o\.|j\.d\.o\.o\.|d\.d\.|j\.t\.d\.|k\.d\.)\b/gi, "")
    .replace(/\b(jednostavno\s+)?dru[sš]tvo\s+s\s+ograni[cč]enom\s+odgovorno[sš][cć]u\b/gi, "")
    .replace(/\bza\s+\w+(\s*,?\s*\w+)*$/gi, "")
    .replace(/,\s*[A-ZČĆŽŠĐ][A-ZČĆŽŠĐa-zčćžšđ\s-]+$/g, "")
    .replace(/[,\s]+$/, "")
    .trim();

  if (cleanName.length < 2) return null;

  console.log("Searching by name:", cleanName);

  // Use tvrtka_naziv filter
  const subjects = await sudregFetch("/subjekti", token, {
    tvrtka_naziv: cleanName,
    only_active: "1",
    limit: "20",
  });

  if (Array.isArray(subjects) && subjects.length > 0) {
    return subjects[0];
  }

  return null;
}

// Get full company details from multiple endpoints by MBS
async function getCompanyDetails(mbs: number, token: string) {
  const [tvrtke, sjedista, pravniOblici, emailAdrese] = await Promise.all([
    sudregFetch("/tvrtke", token, { mbs: String(mbs), limit: "1" }),
    sudregFetch("/sjedista", token, { mbs: String(mbs), limit: "1" }),
    sudregFetch("/pravni_oblici", token, { mbs: String(mbs), limit: "1", expand_relations: "1" }),
    sudregFetch("/email_adrese", token, { mbs: String(mbs), limit: "5" }),
  ]);

  return {
    tvrtka: Array.isArray(tvrtke) && tvrtke.length > 0 ? tvrtke[0] : null,
    sjediste: Array.isArray(sjedista) && sjedista.length > 0 ? sjedista[0] : null,
    pravniOblik: Array.isArray(pravniOblici) && pravniOblici.length > 0 ? pravniOblici[0] : null,
    emails: Array.isArray(emailAdrese) ? emailAdrese : [],
  };
}

// Build structured company data
function buildCompanyData(subject: any, details: any): any {
  const { tvrtka, sjediste, pravniOblik, emails } = details;

  const address = sjediste
    ? [sjediste.ulica, sjediste.kucni_broj ? `${sjediste.kucni_broj}${sjediste.kucni_podbroj || ""}` : ""]
        .filter(Boolean)
        .join(" ")
    : "";

  const city = sjediste?.naziv_naselja || sjediste?.naziv_opcine || "";
  const postalCode = sjediste?.postanski_broj ? String(sjediste.postanski_broj) : "";

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

  const oibFormatted = subject?.oib ? String(subject.oib).padStart(11, "0") : "";
  const mbsFormatted = subject?.mbs ? String(subject.mbs).padStart(9, "0") : "";
  const companyName = tvrtka?.ime || subject?.tvrtka_naziv || "";
  const legalForm = pravniOblik?.pravni_oblik_naziv || pravniOblik?.naziv || "";

  return {
    found: true,
    company_name: companyName,
    oib: oibFormatted,
    mbs: mbsFormatted,
    address,
    city,
    postal_code: postalCode,
    country: "Hrvatska",
    legal_form: legalForm,
    activity_code: "",
    activity_description: "",
    court_registry: courtMap[subject?.sud_id_nadlezan] || "",
    is_vat_payer: false,
    iban: "",
    bank_name: "",
    email: emails.length > 0 ? emails[0].adresa || "" : "",
    phone: "",
    website: "",
    source: "sudreg",
  };
}

// AI fallback for entities not in court register (obrti, udruge, etc.)
async function extractWithAI(query: string, lovableApiKey: string): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());

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
          content: `Ti si AI asistent koji pomaže popuniti podatke o hrvatskim tvrtkama.
PRAVILA:
1. NIKADA ne izmišljaj podatke - ostavi prazan string "" ako nisi siguran.
2. OIB, MBS, IBAN - NIKADA ne izmišljaj!
3. found=true samo ako prepoznaješ tvrtku.
Korisnik traži prema: ${isOIB ? "OIB" : "naziv tvrtke"}`,
        },
        { role: "user", content: `Pronađi podatke za: ${query.trim()}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_company_data",
          description: "Return structured company data.",
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
      }],
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
  if (!toolCall) throw { status: 500, message: "No data from AI" };

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

    const isOIB = /^\d{11}$/.test(query.trim());

    // Try official sudreg API
    if (SUDREG_CLIENT_ID && SUDREG_CLIENT_SECRET) {
      try {
        console.log("Sudreg API lookup for:", query.trim());
        const token = await getAccessToken(SUDREG_CLIENT_ID, SUDREG_CLIENT_SECRET);

        let subject: any = null;

        if (isOIB) {
          subject = await findSubjectByOIB(query.trim(), token);
        } else {
          subject = await findSubjectByName(query.trim(), token);
        }

        if (subject) {
          console.log("Found subject MBS:", subject.mbs, "OIB:", subject.oib);
          const details = await getCompanyDetails(subject.mbs, token);
          const companyData = buildCompanyData(subject, details);
          console.log("Result:", JSON.stringify(companyData));

          return new Response(JSON.stringify(companyData), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("Subject not found in sudreg (may be obrt/udruga), falling back to AI");
      } catch (e) {
        console.error("Sudreg API error:", e instanceof Error ? e.message : e);
        console.log("Falling back to AI");
      }
    }

    // Fallback to AI (for obrti, udruge, and when sudreg API fails)
    const companyData = await extractWithAI(query.trim(), LOVABLE_API_KEY);
    console.log("AI result:", JSON.stringify(companyData));

    return new Response(JSON.stringify(companyData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("lookup-company error:", e);
    const status = e.status || 500;
    const message = e instanceof Error ? e.message : e.message || "Unknown error";

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
