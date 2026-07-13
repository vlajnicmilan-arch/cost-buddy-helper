// Layer 1 mixed-load k6 script — single scenario, three profiles.
//
// Profile via env PROFILE: small (50 VU / 60s) | mid (150 VU / 90s) | full (400 VU / 120s).
// Traffic mix per iteration:
//   ~60% INSERT expense (own user, own custom source, description prefix 'layer1-')
//   ~30% list expenses (typical dashboard query)
//   ~10% read custom_payment_sources balance
//
// Latency is measured, not gated (mandate). Error rate gated <5% to catch collapse.
// handleSummary writes per-endpoint p95/p99 + counters to
// stress/reports/k6-summary.json for downstream sweep to count successful inserts.

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Init-time file reads (k6 restriction).
const tokensFile = JSON.parse(open('../reports/tokens.json'));
const sourcesFile = JSON.parse(open('../reports/layer1-sources.json'));

// Build user_id -> {access_token, source_id} map.
const pool = new SharedArray('pool', function () {
  const bySource = new Map();
  for (const s of sourcesFile.sources) bySource.set(s.user_id, s.source_id);
  const out = [];
  for (const t of tokensFile.pool) {
    const src = bySource.get(t.user_id);
    if (!src) continue; // user without layer1 source — skip
    out.push({ user_id: t.user_id, token: t.access_token, source_id: src });
  }
  if (out.length === 0) throw new Error('layer1: empty auth+source pool');
  return out;
});

const SUPA_URL = __ENV.STRESS_SUPABASE_URL;
const ANON = __ENV.STRESS_SUPABASE_ANON_KEY;
if (!SUPA_URL || !ANON) throw new Error('layer1: STRESS_SUPABASE_URL/ANON missing');

const PROFILE = __ENV.PROFILE || 'small';
const PROFILES = {
  small: { vus: 50,  duration: '60s' },
  mid:   { vus: 150, duration: '90s' },
  full:  { vus: 400, duration: '120s' },
};
const P = PROFILES[PROFILE];
if (!P) throw new Error(`layer1: unknown PROFILE=${PROFILE}`);

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: P.vus },
        { duration: P.duration, target: P.vus },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // Latency is REPORT-ONLY — do NOT gate. Only collapse gate:
    http_req_failed: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

// Per-endpoint trends so summary segregates by call.
const tInsert = new Trend('endpoint_insert_ms', true);
const tList   = new Trend('endpoint_list_ms', true);
const tBal    = new Trend('endpoint_balance_ms', true);
const cInsertOk = new Counter('expense_insert_ok');
const cInsertErr = new Counter('expense_insert_err');
const cListOk = new Counter('list_ok');
const cBalOk = new Counter('balance_ok');

const CATEGORIES = ['food', 'transport', 'utilities', 'entertainment', 'other'];

function pick() {
  return pool[Math.floor(Math.random() * pool.length)];
}
function headers(token) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

export default function () {
  const u = pick();
  const r = Math.random();
  const today = new Date().toISOString().slice(0, 10);

  if (r < 0.6) {
    // INSERT expense — mirror app write shape (payment_source = 'custom:UUID' text).
    const amount = +(Math.random() * 99 + 1).toFixed(2);
    const body = JSON.stringify({
      user_id: u.user_id,
      amount,
      type: 'expense',
      category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
      description: `layer1-vu${__VU}-it${__ITER}`,
      date: today,
      payment_source: `custom:${u.source_id}`,
    });
    const res = http.post(`${SUPA_URL}/rest/v1/expenses`, body, { headers: headers(u.token), tags: { ep: 'insert' } });
    tInsert.add(res.timings.duration);
    if (check(res, { 'insert 201': (r) => r.status === 201 })) cInsertOk.add(1);
    else cInsertErr.add(1);
  } else if (r < 0.9) {
    // Dashboard list — recent expenses for this user.
    const res = http.get(
      `${SUPA_URL}/rest/v1/expenses?select=id,amount,date,category,payment_source&user_id=eq.${u.user_id}&order=date.desc&limit=50`,
      { headers: headers(u.token), tags: { ep: 'list' } }
    );
    tList.add(res.timings.duration);
    if (check(res, { 'list 200': (r) => r.status === 200 })) cListOk.add(1);
  } else {
    // Balance read for user's own source.
    const res = http.get(
      `${SUPA_URL}/rest/v1/custom_payment_sources?select=id,name,balance,correction_anchor_date,correction_anchor_balance&id=eq.${u.source_id}`,
      { headers: headers(u.token), tags: { ep: 'balance' } }
    );
    tBal.add(res.timings.duration);
    if (check(res, { 'balance 200': (r) => r.status === 200 })) cBalOk.add(1);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const grab = (name) => {
    const v = m[name] && m[name].values;
    if (!v) return null;
    return { p95: v['p(95)'], p99: v['p(99)'], avg: v.avg, min: v.min, max: v.max, med: v.med };
  };
  const summary = {
    profile: PROFILE,
    vus_max: P.vus,
    duration: P.duration,
    endpoints: {
      insert:  grab('endpoint_insert_ms'),
      list:    grab('endpoint_list_ms'),
      balance: grab('endpoint_balance_ms'),
    },
    counters: {
      expense_insert_ok:  (m.expense_insert_ok  && m.expense_insert_ok.values.count)  || 0,
      expense_insert_err: (m.expense_insert_err && m.expense_insert_err.values.count) || 0,
      list_ok:            (m.list_ok            && m.list_ok.values.count)            || 0,
      balance_ok:         (m.balance_ok         && m.balance_ok.values.count)         || 0,
    },
    http_req_failed_rate: m.http_req_failed && m.http_req_failed.values.rate,
    http_req_duration:    grab('http_req_duration'),
  };
  // Human stdout — wrapper captures.
  const lines = [];
  lines.push(`\n=== k6 layer1 summary (PROFILE=${PROFILE}, VU=${P.vus}, dur=${P.duration}) ===`);
  for (const [name, v] of Object.entries(summary.endpoints)) {
    if (!v) { lines.push(`  ${name.padEnd(8)}: n/a`); continue; }
    lines.push(`  ${name.padEnd(8)}: p95=${v.p95.toFixed(1)}ms  p99=${v.p99.toFixed(1)}ms  avg=${v.avg.toFixed(1)}ms  max=${v.max.toFixed(1)}ms`);
  }
  lines.push(`  counters:  insert_ok=${summary.counters.expense_insert_ok}  insert_err=${summary.counters.expense_insert_err}  list_ok=${summary.counters.list_ok}  balance_ok=${summary.counters.balance_ok}`);
  lines.push(`  http_req_failed_rate: ${(summary.http_req_failed_rate * 100).toFixed(2)}%`);
  const eps = summary.endpoints;
  const rank = Object.entries(eps).filter(([, v]) => v).sort((a, b) => b[1].p95 - a[1].p95);
  lines.push(`  TOP by p95: ${rank.map(([k, v]) => `${k}(${v.p95.toFixed(0)}ms)`).join(', ')}`);
  const outPath = __ENV.SUMMARY_OUT || 'stress/reports/k6-summary.json';
  return {
    'stdout': lines.join('\n') + '\n',
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
