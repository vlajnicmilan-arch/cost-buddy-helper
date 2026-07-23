import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callGemini } from "../_shared/geminiClient.ts";
import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUDREG_API = "https://sudreg-data.gov.hr/api";
const TOKEN_URL = `${SUDREG_API}/oauth/token`;
const CACHE_TTL_MS = 7 * 86_400_000; // 7 days
const DAILY_LIMIT_PER_USER = 30;

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
  console.log("Token obtained, expires_in:", data.expires_in, "token_type:", data.token_type);
  return data.access_token;
}

async function fetchSubjectDetails(token: string, tipIdentifikatora: string, identifikator: string): Promise<any> {
  const url = `${SUDREG_API}/javni/detalji_subjekta?expand_relations=true&tip_identifikatora=${tipIdentifikatora}&identifikator=${identifikator}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  console.log("Sudreg response status:", response.status);

  if (!response.ok) {
    const errText = await response.text();
    console.error("Sudreg detalji_subjekta error:", response.status, errText.slice(0, 500));
    return null;
  }

  const data = await response.json();
  return data;
}

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
    source: "sudreg",
  };
}

async function extractWithAI(query: string): Promise<any> {
  const isOIB = /^\d{11}$/.test(query.trim());

  const response = await callGemini({
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content: `Ti si AI asistent koji pomaže pronaći podatke o hrvatskim tvrtkama i obrtima.

KRITIČNA PRAVILA:
1. Ako NISI 100% SIGURAN koji je točan naziv tvrtke za dani OIB - vrati found=false.
2. NIKADA ne izmišljaj podatke. Ako nisi siguran za bilo koji podatak, ostavi prazan string "".
3. OIB, MBS, IBAN - NIKADA ne izmišljaj! Samo vrati ako si APSOLUTNO siguran.
4. Bolje je vratiti found=false nego dati krive podatke.
5. OIB je JEDINSTVENI identifikator - za jedan OIB postoji TOČNO JEDNA tvrtka/obrt. Ne pogađaj!
6. Ako korisnik traži po OIB-u i nisi siguran koja tvrtka ima taj OIB, OBAVEZNO vrati found=false.

Korisnik traži prema: ${isOIB ? "OIB broju" : "nazivu tvrtke"}`,
      },
      { role: "user", content: `Pronađi podatke za: ${query.trim()}` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "return_company_data",
        description: "Return structured company data. Return found=false if not sure.",
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
            found: { type: "boolean" },
            source: { type: "string" },
          },
          required: ["found", "company_name", "source"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "return_company_data" } },
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

  // Strip halucinable fields — AI has no reliable source for these
  delete companyData.phone;
  delete companyData.website;
  if (companyData.source !== "sudreg") delete companyData.email;

  return companyData;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. JWT auth required
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Query too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const __svc = createClient(supabaseUrl, serviceKey);

    // 2. Per-user daily rate limit (30/day) using existing ai_usage_daily
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await __svc
      .from("ai_usage_daily")
      .select("count")
      .eq("user_id", userId)
      .eq("route", "lookup-company")
      .eq("usage_date", today)
      .maybeSingle();
    if ((usageRow?.count ?? 0) >= DAILY_LIMIT_PER_USER) {
      return new Response(JSON.stringify({ error: "daily_limit_reached" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = query.trim();
    const isOIB = /^\d{11}$/.test(trimmed);
    const isMBS = /^\d{9}$/.test(trimmed);

    if (isOIB || isMBS) {
      return new Response(JSON.stringify({
        found: false,
        error: "Pretraga po OIB/MBS je trenutno isključena. Upišite naziv tvrtke.",
        source: "disabled_numeric_lookup",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Cache lookup (7-day TTL)
    const queryNorm = trimmed.toLowerCase().replace(/\s+/g, " ");
    const { data: cached } = await __svc
      .from("company_lookup_cache")
      .select("payload, hit_count, updated_at")
      .eq("query_normalized", queryNorm)
      .maybeSingle();

    if (cached && new Date(cached.updated_at).getTime() > Date.now() - CACHE_TTL_MS) {
      __svc.from("company_lookup_cache")
        .update({ hit_count: (cached.hit_count ?? 1) + 1 })
        .eq("query_normalized", queryNorm)
        .then(() => {}, () => {}); // best-effort
      return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. AI call (gated by monthly cost cap)
    const __cap = await checkAiCostCap(__svc);
    if (__cap) return __cap;

    const companyData = await extractWithAI(trimmed);
    recordAiCost(__svc, "lookup-company").catch(() => {});

    // Increment per-user daily counter (best-effort)
    __svc.from("ai_usage_daily")
      .upsert({
        user_id: userId,
        usage_date: today,
        route: "lookup-company",
        count: (usageRow?.count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,usage_date,route" })
      .then(() => {}, () => {});

    // Cache write (best-effort)
    __svc.from("company_lookup_cache")
      .upsert({
        query_normalized: queryNorm,
        payload: companyData,
        updated_at: new Date().toISOString(),
      }, { onConflict: "query_normalized" })
      .then(() => {}, () => {});

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
