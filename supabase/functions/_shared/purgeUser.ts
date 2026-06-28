// Canonical user purge engine.
// Single source of truth for "fully delete a user and all their data".
//
// Callers:
//   - process-pending-deletions (cron, 30-day grace) — uses sourceTag:'cron_grace'
//   - future admin hard-delete entrypoint           — uses sourceTag:'admin_hard_delete'
//
// See docs/HARD_DELETE.md for the foundation contract.

import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  PURGE_BY_USER_ID,
  PURGE_BY_EMAIL,
  PURGE_DEPENDENT,
  PAID_RECORDS_TABLES,
  STORAGE_BUCKETS,
} from "./tablesToPurge.ts";
import type {
  PurgeInput,
  PurgeResult,
  ResidualScanReport,
} from "./purgeUser.types.ts";

type Admin = ReturnType<typeof import("npm:@supabase/supabase-js@2.57.2").createClient>;

const emptyResult = (): PurgeResult => ({
  ok: false,
  tablesPurged: {},
  storagePurged: {},
  invitationsByEmail: {},
  stripeSubscriptionCancelled: false,
  authDeleted: false,
  residualScan: { byUserId: {}, byEmail: {}, dependent: {}, total: 0 },
  errors: [],
});

// ---------------------------------------------------------------------------
// PHASE 0 — pre-flight guards
// ---------------------------------------------------------------------------

/**
 * Returns krug ids owned by the user that still have OTHER members.
 * Empty array => safe to delete krug rows for this user.
 */
async function detectKrugBlockers(admin: Admin, userId: string): Promise<string[]> {
  // 1. find krug ids the user owns
  const { data: ownerships, error: ownErr } = await admin
    .from("krug_ownership")
    .select("krug_id")
    .eq("user_id", userId);
  if (ownErr) throw new Error(`krug_ownership lookup failed: ${ownErr.message}`);
  const krugIds = (ownerships ?? []).map((r: any) => r.krug_id).filter(Boolean);
  if (krugIds.length === 0) return [];

  // 2. check for other members in each owned krug
  const { data: foreignMembers, error: memErr } = await admin
    .from("krug_membership")
    .select("krug_id")
    .in("krug_id", krugIds)
    .neq("user_id", userId);
  if (memErr) throw new Error(`krug_membership lookup failed: ${memErr.message}`);

  const blocked = new Set<string>();
  for (const row of foreignMembers ?? []) blocked.add((row as any).krug_id);
  return Array.from(blocked);
}

async function detectPaidRecords(admin: Admin, userId: string): Promise<number> {
  let total = 0;
  for (const table of PAID_RECORDS_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) {
      console.warn(`[purgeUser] paid records check failed on ${table}:`, error.message);
      continue;
    }
    total += count ?? 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// PHASE 1 — dependent rows (must precede parents)
// ---------------------------------------------------------------------------

async function purgeDependents(
  admin: Admin,
  userId: string,
  result: PurgeResult,
): Promise<void> {
  // Collect parent-id lookups once
  const expenseIds = await loadIds(admin, "expenses", "id", "user_id", userId);
  const invoiceIds = await loadIds(admin, "invoices", "id", "user_id", userId);
  const travelOrderIds = await loadIds(admin, "travel_orders", "id", "user_id", userId);
  const budgetIds = await loadIds(admin, "budget_plans", "id", "user_id", userId);
  const projectIds = await loadIds(admin, "projects", "id", "user_id", userId);
  // krug ids reachable via ownership (only ones we'll actually delete)
  const krugIds = await loadIds(admin, "krug_ownership", "krug_id", "user_id", userId);

  const parentMap: Record<string, string[]> = {
    expense_id: expenseIds,
    invoice_id: invoiceIds,
    travel_order_id: travelOrderIds,
    budget_id: budgetIds,
    project_id: projectIds,
    krug_id: krugIds,
  };

  for (const dep of PURGE_DEPENDENT) {
    try {
      if (dep.via === "created_by" || dep.via === "generated_by") {
        const { error, count } = await admin
          .from(dep.table)
          .delete({ count: "exact" })
          .eq(dep.column, userId);
        if (error) throw error;
        result.tablesPurged[dep.table] = (result.tablesPurged[dep.table] ?? 0) + (count ?? 0);
        continue;
      }

      if (dep.via === "referrer_or_referred") {
        // referrals has both referrer_id and referred_user_id
        const { error: e1, count: c1 } = await admin
          .from(dep.table).delete({ count: "exact" }).eq("referrer_id", userId);
        if (e1) throw e1;
        const { error: e2, count: c2 } = await admin
          .from(dep.table).delete({ count: "exact" }).eq("referred_user_id", userId);
        if (e2) throw e2;
        result.tablesPurged[dep.table] = (c1 ?? 0) + (c2 ?? 0);
        continue;
      }

      const ids = parentMap[dep.via] ?? [];
      if (ids.length === 0) {
        result.tablesPurged[dep.table] = result.tablesPurged[dep.table] ?? 0;
        continue;
      }
      const { error, count } = await admin
        .from(dep.table)
        .delete({ count: "exact" })
        .in(dep.column, ids);
      if (error) throw error;
      result.tablesPurged[dep.table] = (result.tablesPurged[dep.table] ?? 0) + (count ?? 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ phase: "dependents", target: dep.table, message: msg });
      console.warn(`[purgeUser] dependent ${dep.table} failed:`, msg);
    }
  }
}

async function loadIds(
  admin: Admin,
  table: string,
  selectCol: string,
  filterCol: string,
  userId: string,
): Promise<string[]> {
  const { data, error } = await admin.from(table).select(selectCol).eq(filterCol, userId);
  if (error) {
    console.warn(`[purgeUser] loadIds ${table}.${selectCol} failed:`, error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r[selectCol]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// PHASE 2 — user-owned (by user_id)
// ---------------------------------------------------------------------------

async function purgeByUserId(admin: Admin, userId: string, result: PurgeResult): Promise<void> {
  for (const table of PURGE_BY_USER_ID) {
    try {
      const { error, count } = await admin
        .from(table)
        .delete({ count: "exact" })
        .eq("user_id", userId);
      if (error) throw error;
      result.tablesPurged[table] = (result.tablesPurged[table] ?? 0) + (count ?? 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ phase: "by_user_id", target: table, message: msg });
      console.warn(`[purgeUser] by_user_id ${table} failed:`, msg);
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE 3 — invitations / subscriptions by email
// ---------------------------------------------------------------------------

async function purgeByEmail(admin: Admin, email: string | null, result: PurgeResult): Promise<void> {
  if (!email) return;
  for (const { table, column } of PURGE_BY_EMAIL) {
    try {
      const { error, count } = await admin
        .from(table)
        .delete({ count: "exact" })
        .eq(column, email);
      if (error) throw error;
      result.invitationsByEmail[table] = (result.invitationsByEmail[table] ?? 0) + (count ?? 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ phase: "by_email", target: table, message: msg });
      console.warn(`[purgeUser] by_email ${table} failed:`, msg);
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE 4 — storage cleanup
// ---------------------------------------------------------------------------

async function purgeStorage(admin: Admin, userId: string, result: PurgeResult): Promise<void> {
  for (const bucket of STORAGE_BUCKETS) {
    try {
      const all: string[] = [];
      // Recurse one level deep — covers expected layout {userId}/file and {userId}/sub/file
      const { data: top, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error) throw error;
      for (const f of top ?? []) {
        if (f.id) {
          all.push(`${userId}/${f.name}`);
        } else {
          // it's a folder
          const { data: nested } = await admin.storage
            .from(bucket)
            .list(`${userId}/${f.name}`, { limit: 1000 });
          for (const nf of nested ?? []) {
            all.push(`${userId}/${f.name}/${nf.name}`);
          }
        }
      }
      if (all.length > 0) {
        const { error: rmErr } = await admin.storage.from(bucket).remove(all);
        if (rmErr) throw rmErr;
      }
      result.storagePurged[bucket] = all.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push({ phase: "storage", target: bucket, message: msg });
      result.storagePurged[bucket] = result.storagePurged[bucket] ?? 0;
      console.warn(`[purgeUser] storage ${bucket} failed:`, msg);
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE 5 — Stripe
// ---------------------------------------------------------------------------

async function cancelStripe(email: string | null): Promise<boolean> {
  if (!email) return false;
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return false;
  try {
    const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return false;
    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 10,
    });
    for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id);
    return subs.data.length > 0;
  } catch (e) {
    console.error("[purgeUser] stripe cancel failed:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// PHASE 7 — residual scan
// ---------------------------------------------------------------------------

async function residualScan(
  admin: Admin,
  userId: string,
  email: string | null,
): Promise<ResidualScanReport> {
  const report: ResidualScanReport = { byUserId: {}, byEmail: {}, dependent: {}, total: 0 };

  for (const table of PURGE_BY_USER_ID) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) continue;
    if ((count ?? 0) > 0) {
      report.byUserId[table] = count!;
      report.total += count!;
    }
  }

  if (email) {
    for (const { table, column } of PURGE_BY_EMAIL) {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, email);
      if (error) continue;
      if ((count ?? 0) > 0) {
        report.byEmail[table] = count!;
        report.total += count!;
      }
    }
  }

  // Dependent tables that point to created_by/generated_by/referrer are observable
  // directly; expense/invoice/etc. dependents are not (their parents are gone).
  for (const dep of PURGE_DEPENDENT) {
    if (dep.via !== "created_by" && dep.via !== "generated_by" && dep.via !== "referrer_or_referred") continue;
    const cols = dep.via === "referrer_or_referred"
      ? ["referrer_id", "referred_user_id"]
      : [dep.column];
    for (const col of cols) {
      const { count, error } = await admin
        .from(dep.table)
        .select("*", { count: "exact", head: true })
        .eq(col, userId);
      if (error) continue;
      if ((count ?? 0) > 0) {
        report.dependent[`${dep.table}.${col}`] = count!;
        report.total += count!;
      }
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Engine entrypoint
// ---------------------------------------------------------------------------

export async function purgeUser(admin: Admin, input: PurgeInput): Promise<PurgeResult> {
  const { userId, userEmail, policy } = input;
  const result = emptyResult();

  // ---- Phase 0: guards ----
  try {
    if (!policy.allowKrugDestruction) {
      const blockedKrugs = await detectKrugBlockers(admin, userId);
      if (blockedKrugs.length > 0) {
        return {
          ...result,
          blockedBy: "krug_multi_member",
          blockedDetails: { krugIds: blockedKrugs },
        };
      }
    }
    if (!policy.deletePaidRecords) {
      const paidCount = await detectPaidRecords(admin, userId);
      if (paidCount > 0) {
        return {
          ...result,
          blockedBy: "paid_records_present",
          blockedDetails: { count: paidCount },
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push({ phase: "preflight", target: "guards", message: msg });
    return result;
  }

  // ---- Phase 1 ----
  await purgeDependents(admin, userId, result);
  // ---- Phase 2 ----
  await purgeByUserId(admin, userId, result);
  // ---- Phase 3 ----
  await purgeByEmail(admin, userEmail, result);
  // ---- Phase 4 ----
  await purgeStorage(admin, userId, result);
  // ---- Phase 5 ----
  if (policy.cancelStripeSubscription !== false) {
    result.stripeSubscriptionCancelled = await cancelStripe(userEmail);
  }
  // ---- Phase 6 ----
  if (policy.deletePaidRecords) {
    for (const table of PAID_RECORDS_TABLES) {
      try {
        const { error, count } = await admin
          .from(table)
          .delete({ count: "exact" })
          .eq("user_id", userId);
        if (error) throw error;
        result.tablesPurged[table] = (result.tablesPurged[table] ?? 0) + (count ?? 0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push({ phase: "paid_records", target: table, message: msg });
      }
    }
  }

  try {
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;
    result.authDeleted = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push({ phase: "auth_delete", target: userId, message: msg });
  }

  // ---- Phase 7 ----
  try {
    result.residualScan = await residualScan(admin, userId, userEmail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push({ phase: "residual_scan", target: "scan", message: msg });
  }

  result.ok = result.authDeleted && result.residualScan.total === 0;
  return result;
}
