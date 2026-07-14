// supabase/functions/backup-weekly/index.ts
// Tjedni backup: exportira ključne tablice u CSV.gz, upload u PRIVATNI bucket `backups/YYYY-MM-DD/`.
// Retencija: briše foldere starije od 8 tjedana.
// Poziva se iz pg_cron nedjeljom 03:00 Europe/Zagreb.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ključne tablice — sve što je potrebno za rekonstrukciju korisničkih podataka.
// Uključuje motor salda (custom_payment_sources je anchor stanje) + audit ledger (project_worker_payouts).
const TABLES = [
  // Core financial
  "expenses",
  "custom_payment_sources",
  "payment_source_cards",
  "custom_categories",
  "income_sources",
  "recurring_transactions",
  "installment_plans",
  "installments",
  // Projects
  "projects",
  "project_milestones",
  "project_workers",
  "project_work_entries",
  "project_worker_payouts",        // audit ledger salda za radnike
  "project_worker_rate_history",   // audit rate history
  // Budgets
  "budget_plans",
  "budget_categories",
  "budget_members",
  "budget_invitations",
  // Krug
  "krug",
  "krug_membership",
  "krug_ownership",
  "krug_shared_payment_source",
  "krug_act_dedup",
  "krug_deletion_request",
  "krug_deletion_vote",
  // Business
  "business_profiles",
  "clients",
  // Bank
  "bank_connections",
  "bank_accounts",
  // Users / meta
  "profiles",
  "user_roles",
  "user_subscriptions",
  "notification_preferences",
  "app_settings",
];

const PAGE_SIZE = 1000;
const RETENTION_WEEKS = 8;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else {
    s = String(v);
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[], headerKeys: string[]): string {
  const header = headerKeys.join(",");
  const lines = rows.map((r) => headerKeys.map((k) => csvEscape(r[k])).join(","));
  return header + "\n" + lines.join("\n");
}

async function gzipString(input: string): Promise<Uint8Array> {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function fetchAll(supabase: any, table: string): Promise<{ rows: any[]; keys: string[] }> {
  const all: any[] = [];
  let from = 0;
  const keys = new Set<string>();
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) Object.keys(r).forEach((k) => keys.add(k));
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows: all, keys: Array.from(keys).sort() };
}

async function pruneOldFolders(supabase: any, cutoffDate: Date) {
  // Popis top-level "foldera" (YYYY-MM-DD prefixa) u bucketu.
  const { data: entries, error } = await supabase.storage.from("backups").list("", { limit: 1000 });
  if (error) { console.warn("prune list error:", error.message); return { deleted: 0 }; }
  const foldersToDelete: string[] = [];
  for (const e of entries ?? []) {
    // Storage list vraća sve entries; folderi imaju id === null.
    const name = e.name;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
    const d = new Date(name + "T00:00:00Z");
    if (isNaN(d.getTime())) continue;
    if (d < cutoffDate) foldersToDelete.push(name);
  }
  let deleted = 0;
  for (const folder of foldersToDelete) {
    const { data: files } = await supabase.storage.from("backups").list(folder, { limit: 1000 });
    const paths = (files ?? []).map((f: any) => `${folder}/${f.name}`);
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from("backups").remove(paths);
      if (rmErr) console.warn(`prune remove ${folder}:`, rmErr.message);
      else deleted += paths.length;
    }
  }
  return { deleted, foldersDeleted: foldersToDelete };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    const folder = today;
    const results: Array<{ table: string; rows: number; bytes: number; ok: boolean; error?: string }> = [];

    for (const table of TABLES) {
      try {
        const { rows, keys } = await fetchAll(supabase, table);
        if (!keys.length) {
          results.push({ table, rows: 0, bytes: 0, ok: true });
          continue;
        }
        const csv = rowsToCsv(rows, keys);
        const gz = await gzipString(csv);
        const path = `${folder}/${table}.csv.gz`;
        const { error: upErr } = await supabase.storage.from("backups").upload(path, gz, {
          contentType: "application/gzip",
          upsert: true,
        });
        if (upErr) throw new Error(upErr.message);
        results.push({ table, rows: rows.length, bytes: gz.byteLength, ok: true });
      } catch (e: any) {
        results.push({ table, rows: 0, bytes: 0, ok: false, error: e.message });
      }
    }

    // Retencija: obriši foldere starije od 8 tjedana
    const cutoff = new Date(Date.now() - RETENTION_WEEKS * 7 * 86400 * 1000);
    const prune = await pruneOldFolders(supabase, cutoff);

    const totalBytes = results.reduce((a, r) => a + r.bytes, 0);
    const totalRows = results.reduce((a, r) => a + r.rows, 0);
    const failed = results.filter((r) => !r.ok);

    // Log rezultata
    await supabase.from("app_diagnostics_logs").insert({
      session_id: "cron-backup-weekly",
      event: "backup_weekly.completed",
      severity: failed.length ? "warning" : "info",
      details: {
        folder,
        total_rows: totalRows,
        total_bytes: totalBytes,
        tables_ok: results.length - failed.length,
        tables_failed: failed.length,
        failed_tables: failed.map((f) => ({ table: f.table, error: f.error })),
        pruned: prune,
        duration_ms: Date.now() - startedAt,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        folder,
        total_rows: totalRows,
        total_bytes: totalBytes,
        results,
        pruned: prune,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("[backup-weekly] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
