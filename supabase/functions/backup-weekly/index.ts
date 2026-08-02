// supabase/functions/backup-weekly/index.ts
// Tjedni backup: exportira ključne tablice u CSV.gz, upload u PRIVATNI bucket `backups/YYYY-MM-DD/`.
// Retencija: briše foldere starije od 30 dana.
// Poziva se iz pg_cron nedjeljom 03:00 Europe/Zagreb.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { STORAGE_BUCKETS } from "../_shared/tablesToPurge.ts";

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
// Retencija: 30 dana (usklađeno s politikom privatnosti).
const RETENTION_DAYS = 30;
// Prozor mapa u kojem tražimo već prenesene priloge (tjedni ciklus + rezerva).
const PRIOR_INDEX_FOLDERS = Math.ceil(RETENTION_DAYS / 7) + 1;

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

// ---------------------------------------------------------------------------
// Storage attachments backup (incremental, shared pool `_files/`)
// ---------------------------------------------------------------------------

type ManifestFile = {
  bucket: string;
  path: string;
  size: number;
  updated_at: string | null;
  sha256: string | null;
  stored_at: string;
  copied_this_run: boolean;
};

const FILES_PREFIX = "_files";
const TIME_BUDGET_MS = 100_000;
const BYTE_BUDGET = 200 * 1024 * 1024;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Recursively list every object in a bucket. */
async function listBucketObjects(
  supabase: any,
  bucket: string,
  prefix = "",
): Promise<Array<{ path: string; size: number; updated_at: string | null }>> {
  const out: Array<{ path: string; size: number; updated_at: string | null }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    const entries = data ?? [];
    if (entries.length === 0) break;
    for (const e of entries) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) {
        out.push(...(await listBucketObjects(supabase, bucket, full)));
      } else {
        out.push({
          path: full,
          size: Number(e.metadata?.size ?? 0),
          updated_at: e.updated_at ?? e.created_at ?? null,
        });
      }
    }
    if (entries.length < 100) break;
    offset += entries.length;
  }
  return out;
}

/** Top-level backup folders (YYYY-MM-DD), newest first. */
async function listBackupFolders(supabase: any): Promise<string[]> {
  const { data, error } = await supabase.storage.from("backups").list("", { limit: 1000 });
  if (error) return [];
  return (data ?? [])
    .map((e: any) => e.name as string)
    .filter((n: string) => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort()
    .reverse();
}

async function readManifest(supabase: any, folder: string): Promise<any | null> {
  const { data, error } = await supabase.storage.from("backups").download(`${folder}/manifest.json`);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

/**
 * Delete pooled files that appear in no manifest within the retention window.
 * A user-deleted attachment therefore disappears from the pool at most
 * RETENTION_DAYS after its last backup run.
 */
async function pruneOrphanFiles(supabase: any, keep: Set<string>) {
  const pooled: string[] = [];
  for (const bucket of STORAGE_BUCKETS) {
    const objects = await listBucketObjects(supabase, "backups", `${FILES_PREFIX}/${bucket}`).catch(
      () => [] as Array<{ path: string }>,
    );
    pooled.push(...objects.map((o) => o.path));
  }
  const orphans = pooled.filter((p) => !keep.has(p));
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100);
    const { error } = await supabase.storage.from("backups").remove(chunk);
    if (error) console.warn("prune orphan files:", error.message);
    else deleted += chunk.length;
  }
  return { deleted, orphans: orphans.slice(0, 50) };
}

async function backupStorage(
  supabase: any,
  folder: string,
  startedAt: number,
): Promise<{
  files: ManifestFile[];
  buckets: Array<{ bucket: string; files: number; bytes: number; error?: string }>;
  partial: boolean;
  remaining: number;
  copiedFiles: number;
  copiedBytes: number;
  errors: Array<{ bucket: string; path: string; error: string }>;
}> {
  // Index of what previous runs already stored: path -> manifest entry
  const folders = await listBackupFolders(supabase);
  const priorIndex = new Map<string, ManifestFile>();
  for (const f of folders.slice(0, PRIOR_INDEX_FOLDERS)) {
    const m = await readManifest(supabase, f);
    for (const entry of (m?.files ?? []) as ManifestFile[]) {
      const key = `${entry.bucket}::${entry.path}::${entry.size}::${entry.updated_at ?? ""}`;
      if (!priorIndex.has(key)) priorIndex.set(key, entry);
    }
  }

  const files: ManifestFile[] = [];
  const buckets: Array<{ bucket: string; files: number; bytes: number; error?: string }> = [];
  const errors: Array<{ bucket: string; path: string; error: string }> = [];
  let copiedFiles = 0;
  let copiedBytes = 0;
  let partial = false;
  let remaining = 0;

  for (const bucket of STORAGE_BUCKETS) {
    let objects: Array<{ path: string; size: number; updated_at: string | null }> = [];
    try {
      objects = await listBucketObjects(supabase, bucket);
    } catch (e: any) {
      buckets.push({ bucket, files: 0, bytes: 0, error: e.message });
      continue;
    }
    buckets.push({
      bucket,
      files: objects.length,
      bytes: objects.reduce((a, o) => a + o.size, 0),
    });

    for (const obj of objects) {
      const key = `${bucket}::${obj.path}::${obj.size}::${obj.updated_at ?? ""}`;
      const prior = priorIndex.get(key);
      const storedAt = `${FILES_PREFIX}/${bucket}/${obj.path}`;

      if (prior) {
        // Unchanged since a previous run — pool copy already exists.
        files.push({
          bucket,
          path: obj.path,
          size: obj.size,
          updated_at: obj.updated_at,
          sha256: prior.sha256 ?? null,
          stored_at: storedAt,
          copied_this_run: false,
        });
        continue;
      }

      if (Date.now() - startedAt > TIME_BUDGET_MS || copiedBytes > BYTE_BUDGET) {
        partial = true;
        remaining++;
        continue;
      }

      try {
        const { data, error } = await supabase.storage.from(bucket).download(obj.path);
        if (error || !data) throw new Error(error?.message ?? "empty download");
        const bytes = new Uint8Array(await data.arrayBuffer());
        const hash = await sha256Hex(bytes);
        const { error: upErr } = await supabase.storage
          .from("backups")
          .upload(storedAt, bytes, { contentType: data.type || "application/octet-stream", upsert: true });
        if (upErr) throw new Error(upErr.message);
        copiedFiles++;
        copiedBytes += bytes.byteLength;
        files.push({
          bucket,
          path: obj.path,
          size: obj.size || bytes.byteLength,
          updated_at: obj.updated_at,
          sha256: hash,
          stored_at: storedAt,
          copied_this_run: true,
        });
      } catch (e: any) {
        errors.push({ bucket, path: obj.path, error: e.message });
        remaining++;
        partial = true;
      }
    }
  }

  return { files, buckets, partial, remaining, copiedFiles, copiedBytes, errors };
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

    // Prilozi (Storage) — inkrementalno u dijeljeno spremište `_files/`
    const storage = await backupStorage(supabase, folder, startedAt);

    // Koliko je uzastopnih prolaza završilo nepotpuno (partial)
    let consecutivePartial = storage.partial ? 1 : 0;
    if (storage.partial) {
      const prevFolders = (await listBackupFolders(supabase)).filter((f) => f !== folder);
      for (const f of prevFolders) {
        const m = await readManifest(supabase, f);
        if (m?.partial) consecutivePartial++;
        else break;
      }
    }

    const totalBytes = results.reduce((a, r) => a + r.bytes, 0);
    const totalRows = results.reduce((a, r) => a + r.rows, 0);
    const failed = results.filter((r) => !r.ok);

    const manifest = {
      created_at: new Date().toISOString(),
      folder,
      partial: storage.partial,
      remaining_files: storage.remaining,
      consecutive_partial_runs: consecutivePartial,
      tables: results,
      buckets: storage.buckets,
      files: storage.files,
      totals: {
        tables: results.length,
        rows: totalRows,
        table_bytes: totalBytes,
        files: storage.files.length,
        file_bytes: storage.files.reduce((a, f) => a + f.size, 0),
        copied_files: storage.copiedFiles,
        copied_bytes: storage.copiedBytes,
      },
      errors: [
        ...failed.map((f) => ({ kind: "table", table: f.table, error: f.error })),
        ...storage.errors.map((e) => ({ kind: "file", ...e })),
      ],
      duration_ms: Date.now() - startedAt,
    };

    await supabase.storage
      .from("backups")
      .upload(`${folder}/manifest.json`, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), {
        contentType: "application/json",
        upsert: true,
      });

    // Retencija: obriši foldere starije od 30 dana
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400 * 1000);
    const prune = await pruneOldFolders(supabase, cutoff);

    // Retencija priloga: iz spremišta ispada sve što nije ni u jednom
    // manifestu unutar prozora zadržavanja (uklj. datoteke koje je korisnik obrisao).
    const keep = new Set<string>(storage.files.map((f) => f.stored_at));
    for (const f of await listBackupFolders(supabase)) {
      if (f === folder) continue;
      if (new Date(f + "T00:00:00Z") < cutoff) continue;
      const m = await readManifest(supabase, f);
      for (const entry of (m?.files ?? []) as ManifestFile[]) keep.add(entry.stored_at);
    }
    const prunedFiles = storage.partial
      ? { deleted: 0, skipped: "partial run" }
      : await pruneOrphanFiles(supabase, keep);

    // Log rezultata
    await supabase.from("app_diagnostics_logs").insert({
      session_id: "cron-backup-weekly",
      event: storage.partial ? "backup_weekly.partial" : "backup_weekly.completed",
      severity: consecutivePartial >= 2 ? "error" : (failed.length || storage.partial) ? "warning" : "info",
      details: {
        folder,
        total_rows: totalRows,
        total_bytes: totalBytes,
        tables_ok: results.length - failed.length,
        tables_failed: failed.length,
        failed_tables: failed.map((f) => ({ table: f.table, error: f.error })),
        files_total: storage.files.length,
        files_copied: storage.copiedFiles,
        bytes_copied: storage.copiedBytes,
        files_remaining: storage.remaining,
        partial: storage.partial,
        consecutive_partial_runs: consecutivePartial,
        file_errors: storage.errors.slice(0, 20),
        pruned: prune,
        pruned_files: prunedFiles,
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
        storage: {
          files: storage.files.length,
          copied_files: storage.copiedFiles,
          copied_bytes: storage.copiedBytes,
          remaining: storage.remaining,
          partial: storage.partial,
          consecutive_partial_runs: consecutivePartial,
          errors: storage.errors,
        },
        manifest_path: `${folder}/manifest.json`,
        pruned: prune,
        pruned_files: prunedFiles,
        duration_ms: Date.now() - startedAt,
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
