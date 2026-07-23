// Globalni AI strop troška — jeftini gate + biljezenje.
//
// Ugovor:
//   1) checkAiCostCap(supabase)      → 429 Response s { error: "ai_cap_reached", ... }
//                                       ako je mjesecni trosak >= stropa (default 100 EUR).
//                                       Fail-open pri gresci baze.
//   2) recordAiCost(supabase, route) → best-effort, upisuje trosak i budi
//                                       alarme adminima na pragovima (50/80/100 EUR).
//
// Kesiran je samo READ (60s TTL) — write invalidira kes lokalno. Promjena
// stropa preko app_settings vrijedi za sve edge fn nakon <= 60s (TTL keš).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "./aiQuota.ts";

interface CacheEntry {
  at: number;
  spent: number;
  cap: number;
}

let cache: CacheEntry | null = null;
const TTL_MS = 60_000;

async function readSpend(supabase: SupabaseClient): Promise<CacheEntry | null> {
  const { data, error } = await supabase.rpc("get_ai_monthly_spend");
  if (error) {
    console.warn("[aiCostCap] get_ai_monthly_spend failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    at: Date.now(),
    spent: Number(row.spent_eur ?? 0),
    cap: Number(row.cap_eur ?? 100),
  };
}

export async function checkAiCostCap(supabase: SupabaseClient): Promise<Response | null> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    const fresh = await readSpend(supabase);
    if (fresh) cache = fresh;
    // fail-open ako kes ne postoji i read je pao
    if (!cache) return null;
  }

  if (cache.spent >= cache.cap) {
    return new Response(
      JSON.stringify({
        error: "ai_cap_reached",
        monthly_eur: cache.spent,
        cap_eur: cache.cap,
      }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return null;
}

export async function recordAiCost(supabase: SupabaseClient, route: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("record_ai_cost", { p_route: route });
    if (error) {
      console.warn("[aiCostCap] record_ai_cost failed:", error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      cache = {
        at: Date.now(),
        spent: Number(row.monthly_eur ?? 0),
        cap: Number(row.cap_eur ?? 100),
      };
    }
  } catch (e) {
    console.warn("[aiCostCap] record_ai_cost threw:", (e as Error).message);
  }
}

// Za testove
export function __resetAiCostCapCache(): void {
  cache = null;
}
