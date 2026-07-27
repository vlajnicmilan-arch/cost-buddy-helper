// Faza C1 — Krug FX snapshot freezer.
// PROTECTED: only callable with Authorization: Bearer <KRUG_NOTIFY_INTERNAL_KEY>.
// No public trigger. Any request missing/mismatching the internal key -> 401.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractBearer(h: string | null): string | null {
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function firstDayOfPrevMonth(d = new Date()): { start: string; end: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11 (current)
  const startDate = new Date(Date.UTC(y, m - 1, 1));
  const endDate = new Date(Date.UTC(y, m, 0)); // last day of prev month
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(startDate), end: iso(endDate) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- HARD GATE: internal key check (before any work) ---
  // Accepted from either: `x-krug-internal-key` header (preferred, avoids
  // conflict with gateway's JWT parsing of Authorization) OR Authorization
  // Bearer OR apikey. Any request without the correct value -> 401.
  const internalKey = Deno.env.get('KRUG_NOTIFY_INTERNAL_KEY') ?? '';
  if (!internalKey) {
    console.error('krug-freeze-fx-snapshot: KRUG_NOTIFY_INTERNAL_KEY not configured');
    return json(500, { error: 'server_misconfigured' });
  }
  const bearer = extractBearer(req.headers.get('Authorization'));
  const customHeader = req.headers.get('x-krug-internal-key');
  const apiKeyHeader = req.headers.get('apikey');
  const presented = customHeader ?? bearer ?? apiKeyHeader ?? '';
  if (presented !== internalKey) {
    return json(401, { error: 'unauthorized' });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Optional body override for backfill: { period_start, period_end }
  let body: { period_start?: string; period_end?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { start, end } = firstDayOfPrevMonth();
  const period_start = body.period_start ?? start;
  const period_end = body.period_end ?? end;

  // 1) Fetch rates from exchange-rates edge fn
  const ratesRes = await fetch(`${supabaseUrl}/functions/v1/exchange-rates`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!ratesRes.ok) {
    const txt = await ratesRes.text();
    console.error('exchange-rates failed', ratesRes.status, txt);
    return json(502, { error: 'exchange_rates_failed', status: ratesRes.status });
  }
  const ratesPayload = await ratesRes.json();
  const rates: Record<string, number> | undefined = ratesPayload?.rates;
  if (!rates || typeof rates !== 'object' || !rates.EUR) {
    return json(502, { error: 'exchange_rates_invalid_shape' });
  }

  // 2) Iterate krug rows (only active — not deleted)
  const { data: krugs, error: krugErr } = await admin
    .from('krug')
    .select('id, settlement_currency')
    .is('deleted_at', null);
  if (krugErr) {
    console.error('krug fetch failed', krugErr);
    return json(500, { error: 'krug_fetch_failed', detail: krugErr.message });
  }

  let inserted = 0;
  let skipped = 0;
  const errors: Array<{ krug_id: string; message: string }> = [];

  for (const k of krugs ?? []) {
    const display_currency = (k.settlement_currency ?? 'EUR').toUpperCase();
    const row = {
      krug_id: k.id,
      period_start,
      period_end,
      display_currency,
      rates,
      source: 'exchange-rates',
    };
    // Idempotent upsert: ignoreDuplicates -> ON CONFLICT DO NOTHING
    const { error, count } = await admin
      .from('krug_settlement_fx_snapshot')
      .upsert(row, {
        onConflict: 'krug_id,period_start,period_end,display_currency',
        ignoreDuplicates: true,
        count: 'exact',
      });
    if (error) {
      errors.push({ krug_id: k.id, message: error.message });
    } else if ((count ?? 0) > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return json(200, {
    ok: true,
    period_start,
    period_end,
    scanned: krugs?.length ?? 0,
    inserted,
    skipped,
    errors,
  });
});
