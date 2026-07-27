// Faza C2 — Weekly Krug settlement reminder (debtor-only).
// PROTECTED: only callable with x-krug-internal-key (or Bearer / apikey) that
// matches env KRUG_NOTIFY_INTERNAL_KEY. Any request missing/mismatching -> 401.
// Aggregates unsettled transfers via krug_settlement_preview (RPC already
// subtracts ledger + reads FX snapshot from C1). Emits ONE notification per
// krug per debtor (from_user), grouped by ISO week for dedup.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-krug-internal-key',
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

// ISO week string "YYYY-WW" (Monday-based, matches PostgreSQL IYYY-IW).
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

interface Transfer {
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- HARD GATE ---
  const internalKey = Deno.env.get('KRUG_NOTIFY_INTERNAL_KEY') ?? '';
  if (!internalKey) {
    console.error('krug-settlement-reminder: KRUG_NOTIFY_INTERNAL_KEY not configured');
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

  // Optional body override for backfill / testing.
  let body: { period_start?: string; period_end?: string } = {};
  try { body = await req.json(); } catch { body = {}; }

  // Wide default window: last 2 years to today (covers all realistic
  // outstanding debts; preview subtracts settled ledger regardless).
  const today = new Date();
  const startDefault = new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1));
  const period_start = body.period_start ?? startDefault.toISOString().slice(0, 10);
  const period_end = body.period_end ?? today.toISOString().slice(0, 10);
  const weekTag = isoWeek(today);

  // 1) Load active krugs.
  const { data: krugs, error: krugErr } = await admin
    .from('krug')
    .select('id, name, settlement_currency')
    .is('deleted_at', null);
  if (krugErr) {
    console.error('krug fetch failed', krugErr);
    return json(500, { error: 'krug_fetch_failed', detail: krugErr.message });
  }

  let scanned = 0;
  let notified = 0;
  let skippedNoDebt = 0;
  let skippedPref = 0;
  const errors: Array<{ krug_id?: string; user_id?: string; message: string }> = [];

  for (const k of krugs ?? []) {
    scanned++;
    // 2) Preview (reuse RPC — netting/ledger/FX-snapshot logic lives there).
    const { data: preview, error: prevErr } = await admin.rpc(
      'krug_settlement_preview',
      {
        p_krug_id: k.id,
        p_period_start: period_start,
        p_period_end: period_end,
        p_display_currency: k.settlement_currency ?? 'EUR',
        p_fx_rates: {},
      },
    );
    if (prevErr) {
      errors.push({ krug_id: k.id, message: `preview: ${prevErr.message}` });
      continue;
    }
    const transfers: Transfer[] = (preview as { transfers?: Transfer[] } | null)?.transfers ?? [];
    if (transfers.length === 0) { skippedNoDebt++; continue; }

    // 3) Group by DEBTOR only (from_user). Milan: reminder ide SAMO dužniku.
    type Agg = { total: number; count: number; byCurrency: Map<string, number> };
    const perDebtor = new Map<string, Agg>();
    for (const tr of transfers) {
      const cur = String(tr.currency || 'EUR').toUpperCase();
      const amt = Number(tr.amount) || 0;
      if (!tr.from_user || amt <= 0) continue;
      let agg = perDebtor.get(tr.from_user);
      if (!agg) { agg = { total: 0, count: 0, byCurrency: new Map() }; perDebtor.set(tr.from_user, agg); }
      agg.count++;
      agg.total += amt;
      agg.byCurrency.set(cur, (agg.byCurrency.get(cur) ?? 0) + amt);
    }
    if (perDebtor.size === 0) { skippedNoDebt++; continue; }

    // 4) Fetch preferences for all debtors at once.
    const debtorIds = Array.from(perDebtor.keys());
    const { data: prefRows, error: prefErr } = await admin
      .from('notification_preferences')
      .select('user_id, krug_enabled, krug_settlement_reminder_enabled')
      .in('user_id', debtorIds);
    if (prefErr) {
      errors.push({ krug_id: k.id, message: `prefs: ${prefErr.message}` });
      continue;
    }
    const prefMap = new Map<string, { krug: boolean; reminder: boolean }>();
    for (const p of prefRows ?? []) {
      prefMap.set(p.user_id as string, {
        krug: (p as { krug_enabled?: boolean }).krug_enabled ?? true,
        reminder: (p as { krug_settlement_reminder_enabled?: boolean }).krug_settlement_reminder_enabled ?? true,
      });
    }

    // 5) Emit one notification per debtor.
    for (const [userId, agg] of perDebtor) {
      const pref = prefMap.get(userId) ?? { krug: true, reminder: true };
      if (!pref.krug || !pref.reminder) { skippedPref++; continue; }

      // Dominant currency = highest sum; extras count -> "+N more".
      const currencyEntries = Array.from(agg.byCurrency.entries()).sort((a, b) => b[1] - a[1]);
      const [domCurrency, domAmount] = currencyEntries[0];
      const extras = currencyEntries.length - 1;

      const payload = {
        p_event_type: 'krug_settlement_reminder',
        p_krug_id: k.id,
        p_actor_id: userId, // exclude self in resolver is no-op (override targets user)
        p_dedup_ref: `reminder:${k.id}:${weekTag}:${userId}`,
        p_recipient_override: [userId],
      };

      const { error: emitErr } = await admin.rpc('krug_emit_notification', payload);
      if (emitErr) {
        errors.push({ krug_id: k.id, user_id: userId, message: `emit: ${emitErr.message}` });
        continue;
      }
      notified++;
      // Enrich the just-inserted notification's data payload with counters +
      // krug name, so client can render "N stavki, ukupno €Y (+M valuta)".
      // Best-effort — resolver already inserted the base row via emit fn.
      await admin
        .from('notifications')
        .update({
          data: {
            krug_id: k.id,
            krug_name: k.name ?? null,
            count: agg.count,
            total_amount: Number(domAmount.toFixed(2)),
            currency: domCurrency,
            extra_currencies: extras,
            week: weekTag,
          },
        })
        .eq('user_id', userId)
        .eq('type', 'krug_settlement_reminder')
        .eq('dedup_key', payload.p_dedup_ref);
    }
  }

  return json(200, {
    ok: true,
    week: weekTag,
    period_start,
    period_end,
    scanned,
    notified,
    skipped_no_debt: skippedNoDebt,
    skipped_pref: skippedPref,
    errors,
  });
});
