import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUDREG_API = "https://sudreg-data.gov.hr/api";
const TOKEN_URL = `${SUDREG_API}/oauth/token`;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
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

// Use the correct endpoint: /javni/detalji_subjekta
async function fetchSubjectDetails(token: string, tipIdentifikatora: string, identifikator: string): Promise<any> {
  const url = `${SUDREG_API}/javni/detalji_subjekta?expand_relations=true&tip_identifikatora=${tipIdentifikatora}&identifikator=${identifikator}`;
  console.log("Sudreg detalji_subjekta fetch:", url);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Sudreg detalji_subjekta error:", response.status, errText.slice(0, 300));
    return null;
  }

  return await response.json();
}

// Build structured company data from detalji_subjekta response
function buildCompanyData(data: any): any {
  const companyName = data.skracena_tvrtka?.ime || data.tvrtka?.ime || "";
  const oib = data.oib ? String(data.oib).padStart(11, "0") : "";
  const mbs = data.mbs ? String(data.mbs).padStart(9, "0") : "";

  const sjediste = data.sjediste || {};
  const address = [
    sjediste.ulica,
    sjediste.kucni_broj ? `${sjediste.kucni_broj}${sjediste.kucni_podbroj || ""}` : "",
  ].filter(Boolean).join(" ");
  const city = sjediste.naziv_naselja || sjediste.naziv_opcine || "";
  const postalCode = sjediste.postanski_broj ? String(sjediste.postanski_broj) : "";

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

  const legalForm = data.pravni_oblik?.naziv || "";
  const emails = Array.isArray(data.email_adrese) ? data.email_adrese : [];

  return {
    found: true,
    company_name: companyName,
    oib,
    mbs,
    address,
    city,
    postal_code: postalCode,
    country: "Hrvatska",
    legal_form: legalForm,
    activity_code: data.glavna_djelatnost?.nkd_oznaka || "",
    activity_description: data.glavna_djelatnost?.tekst_djelatnosti || "",
    court_registry: courtMap[data.sud_id_nadlezan] || "",
    is_vat_payer: false,
    iban: "",
    bank_name: "",
    email: emails.length > 0 ? emails[0].adresa || "" : "",
    phone: "",
    website: "",
    source: "sudreg",
  };
}

// AI fallback for entities not in court register
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

    const trimmed = query.trim();
    const isOIB = /^\d{11}$/.test(trimmed);
    const isMBS = /^\d{9}$/.test(trimmed);

    // Try official sudreg API
    if (SUDREG_CLIENT_ID && SUDREG_CLIENT_SECRET && (isOIB || isMBS)) {
      try {
        console.log("Sudreg detalji_subjekta lookup for:", trimmed);
        const token = await getAccessToken(SUDREG_CLIENT_ID, SUDREG_CLIENT_SECRET);

        const tipIdentifikatora = isOIB ? "oib" : "mbs";
        const subjectData = await fetchSubjectDetails(token, tipIdentifikatora, trimmed);

        if (subjectData && subjectData.mbs) {
          console.log("Found subject:", subjectData.skracena_tvrtka?.ime || subjectData.tvrtka?.ime, "MBS:", subjectData.mbs);
          const companyData = buildCompanyData(subjectData);
          console.log("Result:", JSON.stringify(companyData));

          return new Response(JSON.stringify(companyData), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("Subject not found in sudreg, falling back to AI");
      } catch (e) {
        console.error("Sudreg API error:", e instanceof Error ? e.message : e);
        console.log("Falling back to AI");
      }
    }

    // For name searches or fallback
    const companyData = await extractWithAI(trimmed, LOVABLE_API_KEY);
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
