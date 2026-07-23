// Sync transactions from Enable Banking into expenses table.
// Auth: requires JWT (validated in code).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ebFetch } from "../_shared/enableBankingJwt.ts";
import { callGemini } from "../_shared/geminiClient.ts";
import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";

interface Body {
  bank_account_id: string;
}

interface EBTransaction {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount: string; currency: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  remittance_information?: string[] | { content?: string }[];
  creditor?: { name?: string };
  debtor?: { name?: string };
  status?: string;
}

function extractRemittance(tx: EBTransaction): string {
  const ri = tx.remittance_information;
  if (Array.isArray(ri) && ri.length > 0) {
    const parts = ri
      .map((r) => (typeof r === "string" ? r : r?.content || ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }
  return "";
}

function pickDescription(tx: EBTransaction): string {
  const isIncome = tx.credit_debit_indicator === "CRDT";
  const counterparty = isIncome ? tx.debtor?.name : tx.creditor?.name;
  const remittance = extractRemittance(tx);

  // Prefer counterparty (merchant/payer) name; remittance often is just a numeric reference.
  if (counterparty && counterparty.trim()) {
    // Append remittance only if it's not just digits
    if (remittance && !/^[\d\s\-\/]+$/.test(remittance)) {
      return `${counterparty} - ${remittance}`.slice(0, 200);
    }
    return counterparty;
  }
  if (remittance) return remittance.slice(0, 200);
  return "Bank transaction";
}

function pickStableId(tx: EBTransaction): string | null {
  return tx.entry_reference || tx.transaction_id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = (await req.json()) as Body;
    if (!body?.bank_account_id) {
      return new Response(JSON.stringify({ error: "missing_bank_account_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load bank account + connection
    const { data: account, error: accErr } = await admin
      .from("bank_accounts")
      .select("id, user_id, business_profile_id, account_uid, currency, last_synced_at, linked_payment_source_id, connection_id")
      .eq("id", body.bank_account_id)
      .maybeSingle();

    if (accErr || !account) {
      return new Response(JSON.stringify({ error: "account_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (account.user_id !== userId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!account.linked_payment_source_id) {
      return new Response(JSON.stringify({ error: "not_linked" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await admin
      .from("bank_connections")
      .select("id, status, valid_until, session_id")
      .eq("id", account.connection_id)
      .maybeSingle();

    if (!conn) {
      return new Response(JSON.stringify({ error: "connection_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (conn.valid_until && new Date(conn.valid_until) < new Date()) {
      await admin
        .from("bank_accounts")
        .update({ last_sync_error: "session_expired" })
        .eq("id", account.id);
      return new Response(JSON.stringify({ error: "session_expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute date_from: last_synced_at, or 90 days ago
    const since = account.last_synced_at
      ? new Date(account.last_synced_at)
      : new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const dateFrom = since.toISOString().slice(0, 10);

    // Paginate through transactions
    const allTx: EBTransaction[] = [];
    let continuationKey: string | null = null;
    let safety = 0;
    do {
      const params = new URLSearchParams({ date_from: dateFrom });
      if (continuationKey) params.set("continuation_key", continuationKey);
      const res = await ebFetch(
        `/accounts/${encodeURIComponent(account.account_uid)}/transactions?${params.toString()}`
      );
      const text = await res.text();
      if (!res.ok) {
        console.error("[bank-sync-transactions] fetch failed", res.status, text);
        await admin
          .from("bank_accounts")
          .update({ last_sync_error: `fetch_failed_${res.status}` })
          .eq("id", account.id);
        return new Response(JSON.stringify({ error: "fetch_failed", status: res.status, details: text.slice(0, 500) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const json = JSON.parse(text);
      const list: EBTransaction[] = json.transactions ?? [];
      allTx.push(...list);
      continuationKey = json.continuation_key ?? null;
      safety += 1;
    } while (continuationKey && safety < 20);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let aiCategorized = 0;
    const paymentSourceRef = `custom:${account.linked_payment_source_id}`;

    // Load user's custom categories once for AI categorization
    const { data: customCats } = await admin
      .from("custom_categories")
      .select("name")
      .eq("user_id", userId);
    const customCategoryNames: string[] = (customCats || []).map((c: any) => c.name).filter(Boolean);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const defaultCategories = [
      "food", "transport", "shopping", "entertainment", "bills", "health",
      "groceries", "utilities", "rent", "education", "travel", "clothing",
      "beauty", "sports", "pets", "gifts", "subscriptions", "savings",
      "investments", "charity", "kids", "home", "car", "insurance", "taxes", "other",
    ];
    const allCategories = [...defaultCategories, ...customCategoryNames];

    async function categorizeViaAI(description: string): Promise<string | null> {
      if (!LOVABLE_API_KEY || !description) return null;
      // Skip AI for purely numeric/code descriptions (no merchant context)
      if (/^[\d\s\-\/]+$/.test(description.trim())) return null;
      const prompt = `You are a transaction categorizer. Given a bank transaction description, return the single most appropriate category.\n\nAvailable categories: ${allCategories.join(", ")}\n\nRules:\n- Supermarkets (Konzum, Lidl, Kaufland, Spar, Plodine, Interspar, Tommy, Studenac, Billa, dm) → groceries\n- Restaurants, cafes, bakeries, fast food, bars → food\n- Gas stations, parking, tolls, public transit → transport\n- Pharmacy, doctor, hospital → health\n- Electricity, water, gas, internet, phone → utilities\n- Netflix, Spotify, YouTube, HBO → subscriptions\n- Rent, mortgage → rent\n- ATM withdrawal, cash → other\n- Bank fees → bills\n- If unsure → other\n\nReturn ONLY the category name, nothing else.`;
      try {
        const capResp = await checkAiCostCap(admin);
        if (capResp) return null;
        const resp = await callGemini({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: `Description: ${description}` },
          ],
          max_tokens: 20,
        });
        if (!resp.ok) {
          if (resp.status === 429 || resp.status === 402) return null;
          return null;
        }
        recordAiCost(admin, "bank-sync-transactions").catch(() => {});
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content?.trim().toLowerCase() || null;
        return raw && allCategories.includes(raw) ? raw : null;
      } catch {
        return null;
      }
    }

    // Helper: pronađi kandidate za match.
    // Strict window: <10€ isti dan; 10–50€ ±1 dan; >50€ ±3 dana.
    async function findCandidates(absAmount: number, txDate: string, type: "expense" | "income") {
      let windowDays = 0;
      if (absAmount > 50) windowDays = 3;
      else if (absAmount >= 10) windowDays = 1;
      const center = new Date(txDate);
      const from = new Date(center.getTime() - windowDays * 86400000).toISOString();
      const to = new Date(center.getTime() + (windowDays + 1) * 86400000).toISOString();

      const { data, error } = await admin
        .from("expenses")
        .select("id, amount, date, bank_match_status")
        .eq("user_id", userId)
        .eq("payment_source", paymentSourceRef)
        .eq("type", type)
        .is("bank_transaction_id", null)
        .is("deleted_at", null)
        .in("bank_match_status", ["manual", "pending_bank", "bank_only"])
        .gte("amount", absAmount - 0.01)
        .lte("amount", absAmount + 0.01)
        .gte("date", from)
        .lte("date", to);
      if (error) {
        console.warn("[bank-sync-transactions] candidates query err", error.message);
        return [];
      }
      return data || [];
    }

    for (const tx of allTx) {
      const stableId = pickStableId(tx);
      if (!stableId) { skipped += 1; continue; }
      if (!tx.transaction_amount?.amount) { skipped += 1; continue; }

      const amount = parseFloat(tx.transaction_amount.amount);
      if (!isFinite(amount) || amount === 0) { skipped += 1; continue; }
      const absAmount = Math.abs(amount);

      const txDate = tx.booking_date || tx.value_date;
      if (!txDate) { skipped += 1; continue; }

      const isIncome = tx.credit_debit_indicator === "CRDT";
      const description = pickDescription(tx);
      const type = isIncome ? "income" : "expense";

      // Hybrid bank-first match logika.
      const candidates = await findCandidates(absAmount, txDate, type);
      const center = new Date(txDate).getTime();

      if (candidates.length === 1) {
        // 1 jasan kandidat — UPDATE postojeći expense u 'confirmed'.
        const cand = candidates[0];
        const { error: updErr } = await admin
          .from("expenses")
          .update({
            bank_transaction_id: stableId,
            bank_account_id: account.id,
            bank_match_status: "confirmed",
          })
          .eq("id", cand.id);
        if (updErr) {
          if ((updErr as any).code === "23505") { skipped += 1; }
          else { console.warn("[bank-sync-transactions] confirm update err", updErr.message); errors += 1; }
        } else {
          imported += 1;
        }
        continue;
      }

      // 0 ili >1 kandidata — INSERT novi bank_only.
      // AI categorization (samo expense, samo ako nemamo kandidata).
      let category = "other";
      if (!isIncome) {
        const aiCat = await categorizeViaAI(description);
        if (aiCat) {
          category = aiCat;
          aiCategorized += 1;
        }
      }

      let possibleDuplicateOf: string | null = null;
      if (candidates.length > 1) {
        // Fallback: nesiguran match → bank_only + possible_duplicate_of na najbliži kandidat.
        const sorted = [...candidates].sort((a, b) => {
          const da = Math.abs(new Date(a.date).getTime() - center);
          const db = Math.abs(new Date(b.date).getTime() - center);
          if (da !== db) return da - db;
          return Math.abs(a.amount - absAmount) - Math.abs(b.amount - absAmount);
        });
        possibleDuplicateOf = sorted[0].id;
      }

      const row = {
        user_id: userId,
        amount: absAmount,
        description,
        category,
        type,
        date: new Date(txDate).toISOString(),
        payment_source: paymentSourceRef,
        currency: tx.transaction_amount.currency || account.currency || "EUR",
        business_profile_id: account.business_profile_id,
        bank_transaction_id: stableId,
        bank_account_id: account.id,
        ai_extracted: category !== "other",
        bank_match_status: "bank_only",
        possible_duplicate_of: possibleDuplicateOf,
      };

      const { error: insErr } = await admin.from("expenses").insert(row);
      if (insErr) {
        if ((insErr as any).code === "23505") {
          skipped += 1;
        } else {
          console.warn("[bank-sync-transactions] insert err", insErr.message);
          errors += 1;
        }
      } else {
        imported += 1;
      }
    }

    await admin
      .from("bank_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", account.id);

    return new Response(JSON.stringify({
      success: true,
      imported,
      skipped,
      errors,
      ai_categorized: aiCategorized,
      total: allTx.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[bank-sync-transactions] exception", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
