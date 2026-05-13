// Sync transactions from Enable Banking into expenses table.
// Auth: requires JWT (validated in code).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ebFetch } from "../_shared/enableBankingJwt.ts";

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

function pickDescription(tx: EBTransaction): string {
  const ri = tx.remittance_information;
  if (Array.isArray(ri) && ri.length > 0) {
    const first = ri[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first?.content) return first.content;
  }
  return tx.creditor?.name || tx.debtor?.name || "Bank transaction";
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
      const prompt = `You are a transaction categorizer. Given a bank transaction description, return the single most appropriate category.\n\nAvailable categories: ${allCategories.join(", ")}\n\nRules:\n- Supermarkets (Konzum, Lidl, Kaufland, Spar, Plodine, Interspar, Tommy, Studenac, Billa, dm) → groceries\n- Restaurants, cafes, bakeries, fast food, bars → food\n- Gas stations, parking, tolls, public transit → transport\n- Pharmacy, doctor, hospital → health\n- Electricity, water, gas, internet, phone → utilities\n- Netflix, Spotify, YouTube, HBO → subscriptions\n- Rent, mortgage → rent\n- ATM withdrawal, cash → other\n- Bank fees → bills\n- If unsure → other\n\nReturn ONLY the category name, nothing else.`;
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: `Description: ${description}` },
            ],
            max_tokens: 20,
          }),
        });
        if (!resp.ok) {
          if (resp.status === 429 || resp.status === 402) return null;
          return null;
        }
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content?.trim().toLowerCase() || null;
        return raw && allCategories.includes(raw) ? raw : null;
      } catch {
        return null;
      }
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

      // AI categorization for expenses only (income → other)
      let category = "other";
      if (!isIncome) {
        const aiCat = await categorizeViaAI(description);
        if (aiCat) {
          category = aiCat;
          aiCategorized += 1;
        }
      }

      const row = {
        user_id: userId,
        amount: absAmount,
        description,
        category,
        type: isIncome ? "income" : "expense",
        date: new Date(txDate).toISOString(),
        payment_source: paymentSourceRef,
        currency: tx.transaction_amount.currency || account.currency || "EUR",
        business_profile_id: account.business_profile_id,
        bank_transaction_id: stableId,
        bank_account_id: account.id,
        ai_extracted: category !== "other",
      };

      const { error: insErr } = await admin.from("expenses").insert(row);
      if (insErr) {
        // unique constraint = duplicate, OK
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
