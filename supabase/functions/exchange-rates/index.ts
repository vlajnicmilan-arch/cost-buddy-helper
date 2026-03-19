import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cache exchange rates for 1 hour
let cachedRates: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    
    // Return cached rates if still valid
    if (cachedRates && (now - cacheTimestamp) < CACHE_DURATION) {
      return new Response(JSON.stringify({ rates: cachedRates, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch from frankfurter.app (free, no API key needed, ECB mid-rates)
    const baseCurrency = 'EUR';
    const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`);
    
    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Build rates object with EUR as base (EUR = 1)
    const rates: Record<string, number> = { EUR: 1, ...data.rates };
    
    // Add HRK (fixed rate since Croatia joined Eurozone)
    rates['HRK'] = 7.5345;
    // Add BAM (fixed peg to EUR)
    rates['BAM'] = 1.95583;
    
    cachedRates = rates;
    cacheTimestamp = now;

    return new Response(JSON.stringify({ rates, cached: false, date: data.date }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Exchange rate error:', error);
    
    // Return fallback rates if API fails
    const fallbackRates: Record<string, number> = {
      EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.97, HRK: 7.5345,
      PLN: 4.32, CZK: 25.3, HUF: 395, RSD: 117.2, BAM: 1.95583, PEN: 4.05
    };
    
    return new Response(JSON.stringify({ rates: fallbackRates, cached: false, fallback: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
