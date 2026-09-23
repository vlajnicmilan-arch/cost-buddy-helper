// Sync transactions from Enable Banking into expenses table.
// Auth: requires JWT (validated in code).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ebFetch } from "../_shared/enableBankingJwt.ts";
import { callGemini } from "../_shared/geminiClient.ts";
import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";
import {
  decideBankSyncRow,
  pickMergeTarget,
  pickBankBalance,
  counterpartyOf,
  type EBTransactionLike,
  type BankSyncDecision,
  type WalletRef,
  type MergeCandidateRow,
} from "../_shared/bankSyncDecision.ts";

import type { UserCardRef } from "../_shared/cardMatch.ts";
import {
  matchTransferPair,
  type TransferPairCandidate,
} from "../_shared/transferPairMatch.ts";
import {
  BankSyncShadow,
  type ShadowRowInput,
} from "../_shared/bankSyncShadow.ts";
import type { LedgerCandidate } from "../_shared/moneyLedgerPlan.ts";
import { TRANSFER_KEYWORDS, buildTransferPair } from "../_shared/moneyDirection.ts";
import {
  cardWalletMapFrom,
  chooseSyncMerge,
  countedCandidates,
  planSyncSameExpense,
  type SyncSameExpenseEntry,
} from "../_shared/bankSyncSameExpense.ts";

interface Body {
  bank_account_id: string;
}

// Throttle constants (per-account cooldowns).
// Faza 1: bez migracije — koristimo postojeći last_synced_at + last_sync_error(+updated_at kao proxy).
const SYNC_COOLDOWN_MINUTES = 120;
const RATE_LIMIT_COOLDOWN_MINUTES = 240;
const RATE_LIMIT_ERROR_MARKER = "aspsp_rate_limited_429";

type EBTransaction = EBTransactionLike;


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
      .select("id, user_id, business_profile_id, account_uid, currency, last_synced_at, last_sync_error, updated_at, linked_payment_source_id, connection_id, raw_payload")
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

    // ── Throttle pre-flight (Faza 1) ──────────────────────────────────────
    // 1) Post-429 cooldown: ako je zadnji sync pao s ASPSP rate-limitom, čekamo dulje.
    //    Koristimo updated_at kao proxy za "kad je error zabilježen" (bez migracije).
    const nowMs = Date.now();
    const wasRateLimited =
      typeof account.last_sync_error === "string" &&
      account.last_sync_error.includes("429");
    if (wasRateLimited && account.updated_at) {
      const errAgeMs = nowMs - new Date(account.updated_at).getTime();
      const cooldownMs = RATE_LIMIT_COOLDOWN_MINUTES * 60 * 1000;
      if (errAgeMs >= 0 && errAgeMs < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - errAgeMs) / 1000);
        return new Response(
          JSON.stringify({
            error: "aspsp_cooldown",
            throttled: true,
            reason: "aspsp_cooldown",
            retry_after_seconds: retryAfter,
            last_error_at: account.updated_at,
            cooldown_minutes: RATE_LIMIT_COOLDOWN_MINUTES,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
            },
          },
        );
      }
    }

    // 2) Normalni cooldown: nedavno uspješan sync — spriječi rapid-fire "Osvježi".
    if (account.last_synced_at) {
      const ageMs = nowMs - new Date(account.last_synced_at).getTime();
      const cooldownMs = SYNC_COOLDOWN_MINUTES * 60 * 1000;
      if (ageMs >= 0 && ageMs < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - ageMs) / 1000);
        return new Response(
          JSON.stringify({
            error: "throttled",
            throttled: true,
            reason: "recent_sync",
            retry_after_seconds: retryAfter,
            last_synced_at: account.last_synced_at,
            cooldown_minutes: SYNC_COOLDOWN_MINUTES,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
            },
          },
        );
      }
    }
    // ──────────────────────────────────────────────────────────────────────

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
        const errorMarker =
          res.status === 429 ? RATE_LIMIT_ERROR_MARKER : `fetch_failed_${res.status}`;
        await admin
          .from("bank_accounts")
          .update({ last_sync_error: errorMarker })
          .eq("id", account.id);
        if (res.status === 429) {
          const retryAfter = RATE_LIMIT_COOLDOWN_MINUTES * 60;
          return new Response(
            JSON.stringify({
              error: "aspsp_cooldown",
              throttled: true,
              reason: "aspsp_cooldown",
              retry_after_seconds: retryAfter,
              cooldown_minutes: RATE_LIMIT_COOLDOWN_MINUTES,
              upstream_status: 429,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                "Retry-After": String(retryAfter),
              },
            },
          );
        }
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

    // PRIPADNOST TVRTKI ide po NOVČANIKU na koji se knjiži. Bankovni račun
    // može biti bez oznake tvrtke, a povezani novčanik firmin — tada je
    // novčanik mjerodavan, inače bi redak završio kao "osoban".
    const { data: linkedSource } = await admin
      .from("custom_payment_sources")
      .select("business_profile_id")
      .eq("id", account.linked_payment_source_id)
      .maybeSingle();
    const rowBusinessProfileId =
      (linkedSource?.business_profile_id as string | null | undefined) ??
      account.business_profile_id ??
      null;

    // Broj kartice je PRIMARNI signal o tome tko je platio — učitaj sve
    // korisnikove upisane kartice (uključujući „Wallet" brojeve).
    const { data: cardRows } = await admin
      .from("payment_source_cards")
      .select("id, last_four_digits, payment_source_id")
      .eq("user_id", userId);
    const userCards: UserCardRef[] = (cardRows || []) as UserCardRef[];

    // Svi korisnikovi novčanici — kandidati za drugu stranu prijenosa.
    const { data: walletRows } = await admin
      .from("custom_payment_sources")
      .select("id, name")
      .eq("user_id", userId)
      .is("deleted_at", null);
    const userWallets: WalletRef[] = ((walletRows || []) as Array<{ id: string; name: string | null }>)
      .map((w) => ({ id: w.id, name: w.name }));

    // Sirovi zapis retka koji NIJE upisan u expenses (rezervacija, traži
    // potvrdu) mora negdje završiti — inače dokaza nema.
    const diagnostics: Array<Record<string, unknown>> = [];
    function logSkipped(decision: BankSyncDecision) {
      diagnostics.push({
        event: "bank_sync_skipped_row",
        session_id: `bank-sync-${account.id}`,
        user_id: userId,
        severity: "info",
        details: {
          bank_account_id: account.id,
          bank_transaction_id: decision.stableId,
          reason: decision.reason,
          is_reservation: decision.isReservation,
          payment_source: paymentSourceRef,
          raw: decision.raw,
        },
      });
    }

    // SJENA (KORAK 3, NALOG 2): zajednička jezgra `moneyLedgerPlan` trči
    // usporedno sa starom odlukom i NIŠTA ne odlučuje. Nijedan upis, brojač ni
    // grana ne ovise o njoj; `observe` nikad ne baca.
    const shadow = new BankSyncShadow({
      sessionId: `bank-sync-${account.id}`,
      userId,
      bankAccountId: account.id,
    });



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
        .select("id, user_id, amount, date, bank_match_status")
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

    let reservationsSkipped = 0;
    let needsConfirmation = 0;
    let mergedBooked = 0;
    let ambiguousTransfers = 0;
    let autoTransfers = 0;
    let transfersPaired = 0;
    let pairsConverted = 0;
    /** Jedan postojeći redak može biti druga strana SAMO jednom po sinkronizaciji. */
    const claimedPairIds = new Set<string>();
    const userCardLast4 = userCards
      .map((c) => String(c.last_four_digits ?? ""))
      .filter((v) => /^\d{4}$/.test(v));

    const decisions = allTx.map((tx) =>
      decideBankSyncRow(tx, {
        syncPaymentSourceId: account.linked_payment_source_id,
        cards: userCards,
        wallets: userWallets,
      })
    );

    // Upit kandidata za spajanje (vlasnik IZ BAZE). Prijenos ima DVIJE strane.
    const buildMergeQuery = (absAmount: number, txDate: string, decision: BankSyncDecision) => {
      const mergeFrom = new Date(new Date(txDate).getTime() - 3 * 86400000).toISOString();
      const mergeTo = new Date(new Date(txDate).getTime() + 4 * 86400000).toISOString();
      let mergeQuery = admin
        .from("expenses")
        .select(
          "id, user_id, amount, date, description, merchant_name, payment_source, payment_source_card_id, expense_nature, is_advance, linked_advance_ids, deleted_at, bank_transaction_id, bank_match_status, type, status",
        )
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("amount", absAmount - 0.01)
        .lte("amount", absAmount + 0.01)
        .gte("date", mergeFrom)
        .lte("date", mergeTo);
      if (decision.transfer) {
        const a = account.linked_payment_source_id;
        const b = decision.transfer.counterpartSourceId;
        mergeQuery = mergeQuery
          .eq("type", "transfer")
          .or(
            [
              `payment_source.eq."custom:${a}"`,
              `payment_source.eq."custom:${b}"`,
              `income_source_id.eq.${a}`,
              `income_source_id.eq.${b}`,
            ].join(","),
          );
      } else {
        mergeQuery = mergeQuery
          .eq("payment_source", paymentSourceRef)
          .in("type", [decision.type as string, "transfer"]);
      }
      return mergeQuery;
    };

    // PRAVILO „ISTI TROŠAK" (nalog 2): pred-prolaz nad SVIM knjiženim
    // retcima trošak/prihod PRIJE pisanja — jedan-na-jedan kao
    // decideSameExpenseAutoBatch. Prijenosi ovdje ne ulaze.
    const cardWallets = cardWalletMapFrom((cardRows || []) as Array<{ id: string; payment_source_id?: string | null }>);
    const plainCandidateCache = new Map<number, any[]>();
    const sameExpenseEntries: SyncSameExpenseEntry[] = [];
    for (let i = 0; i < decisions.length; i += 1) {
      const d = decisions[i];
      if (d.action === "skip" || d.transfer || !d.stableId) continue;
      if (d.type !== "expense" && d.type !== "income") continue;
      const { data: rows } = await buildMergeQuery(d.amount!, d.date!, d);
      const list = (rows || []) as any[];
      plainCandidateCache.set(i, list);
      sameExpenseEntries.push({
        bank: {
          stableId: d.stableId,
          userId,
          paymentSource: paymentSourceRef,
          type: d.type,
          amount: d.amount!,
          date: d.date!,
          counterparty: counterpartyOf(allTx[i], d.description),
          description: d.description ?? null,
          cardId: d.paymentSourceCardId ?? null,
        },
        candidates: list,
      });
    }
    let sameExpensePlan: ReturnType<typeof planSyncSameExpense> = new Map();
    try {
      sameExpensePlan = planSyncSameExpense(sameExpenseEntries, cardWallets);
    } catch (ruleFail: any) {
      // Bez odluke pravila nema spajanja — retci idu kao novi.
      diagnostics.push({
        event: "bank_sync_same_expense_failed",
        session_id: `bank-sync-${account.id}`,
        user_id: userId,
        severity: "error",
        details: { bank_account_id: account.id, message: ruleFail?.message ?? String(ruleFail) },
      });
    }
    /** Ručni redak spojen u ovom pokretanju ne smije se spojiti drugi put. */
    const mergedManualIds = new Set<string>();

    let rowIndex = -1;
    for (const tx of allTx) {
      rowIndex += 1;
      const decision = decisions[rowIndex];

      // Kandidati koje jezgra SMIJE vidjeti — `userId` je onaj IZ BAZE.
      const shadowCandidates: LedgerCandidate[] = [];
      const observeShadow = (
        legacyOutcome: ShadowRowInput["legacyOutcome"],
        classification: ShadowRowInput["classification"],
        userChoice: ShadowRowInput["userChoice"] = {},
      ) => {
        shadow.observe({
          rowIndex,
          userId,
          stableId: decision.stableId,
          amount: decision.amount,
          dateIso: decision.date,
          direction: decision.type === "income" ? "in" : decision.type === "expense" ? "out" : null,
          walletId: account.linked_payment_source_id as string,
          legacyOutcome,
          classification,
          candidates: shadowCandidates,
          userChoice,
        });
      };

      if (decision.action === "skip") {
        skipped += 1;
        if (decision.reason === "reservation") reservationsSkipped += 1;
        if (decision.reason === "card_source_mismatch") needsConfirmation += 1;
        if (decision.stableId) logSkipped(decision);
        observeShadow("needs_review", {
          kind: "new",
          existsByFingerprint: false,
          deletedByFingerprint: false,
        });
        continue;
      }


      // Dva novčanika pogađaju ime → odredište nije sigurno; redak ide kao
      // rashod/priljev, ali ostaje trag.
      if (decision.ambiguousTransfer) {
        ambiguousTransfers += 1;
        diagnostics.push({
          event: "transfer_candidate_ambiguous",
          session_id: `bank-sync-${account.id}`,
          user_id: userId,
          severity: "info",
          details: {
            bank_account_id: account.id,
            bank_transaction_id: decision.stableId,
            payment_source: paymentSourceRef,
            raw: decision.raw,
          },
        });
      }

      const stableId = decision.stableId!;
      const absAmount = decision.amount!;
      const txDate = decision.date!;
      const description = decision.description;
      const type = decision.type!;
      const isIncome = type === "income";
      const rawLine = JSON.stringify(decision.raw);

      // UPARIVANJE DVIJU STRANA PRIJENOSA — isti novac s drugog izvoda već
      // može stajati u knjigama. Ide PRIJE pickMergeTarget: par se ne stvara
      // nanovo, nego se na postojeći redak upisuje druga strana.
      if (decision.transfer) {
        const statementWalletId = account.linked_payment_source_id as string;
        const direction: "in" | "out" =
          decision.transfer.paymentSource === `custom:${statementWalletId}` ? "out" : "in";
        const counterpartWalletId = decision.transfer.counterpartSourceId ?? null;
        try {
          const pairFrom = new Date(new Date(txDate).getTime() - 3 * 86400000).toISOString();
          const pairTo = new Date(new Date(txDate).getTime() + 4 * 86400000).toISOString();
          const { data: pairRows, error: pairErr } = await admin
            .from("expenses")
            .select(
              "id, user_id, amount, date, type, description, payment_source, income_source_id, bank_transaction_id, counterpart_bank_transaction_id, transfer_counterpart_origin, bank_match_status, bank_raw_line, bank_raw_line_source, bank_raw_line_source, import_batch_id, status",
            )
            .eq("user_id", userId)
            .in("type", ["transfer", "income", "expense"])
            .is("deleted_at", null)
            .gte("date", pairFrom)
            .lte("date", pairTo);
          if (pairErr) throw pairErr;

          const candidates: TransferPairCandidate[] = (pairRows || [])
            .filter((r: any) => !r.status || r.status === "approved")
            .map((r: any) => ({
              id: r.id,
              amount: Number(r.amount),
              date: r.date,
              payerWalletId:
                typeof r.payment_source === "string" && r.payment_source.startsWith("custom:")
                  ? r.payment_source.slice("custom:".length)
                  : null,
              receiverWalletId: r.income_source_id ?? null,
              bankTransactionId: r.bank_transaction_id ?? null,
              counterpartBankTransactionId: r.counterpart_bank_transaction_id ?? null,
              transferCounterpartOrigin: r.transfer_counterpart_origin ?? null,
              type: r.type ?? null,
              description: r.description ?? null,
              walletId:
                typeof r.payment_source === "string" && r.payment_source.startsWith("custom:")
                  ? r.payment_source.slice("custom:".length)
                  : null,
              origin:
                r.bank_raw_line_source === "enable_banking"
                  ? "sync"
                  : (r.import_batch_id || r.bank_transaction_id ? "import" : "manual"),
            }));

          // Vlasnik kandidata je onaj IZ BAZE, ne prepisan s retka koji se
          // obrađuje — sync radi mimo RLS-a, pa jezgra mora sama izbaciti tuđe.
          for (const r of (pairRows || []) as any[]) {
            shadowCandidates.push({ id: r.id, userId: r.user_id, kind: "pair_default" });
          }

          const match = matchTransferPair({
            amount: absAmount,
            date: txDate,
            statementWalletId,
            direction,
            counterpartWalletId,
            fingerprint: stableId,
            candidates,
            claimedCandidateIds: [...claimedPairIds],
            cardLast4: userCardLast4,
            transferKeywords: TRANSFER_KEYWORDS,
          });

          if (match.kind === "same_row") {
            skipped += 1;
            observeShadow("needs_review", {
              kind: "new",
              existsByFingerprint: true,
              deletedByFingerprint: false,
            });
            continue;
          }
          if (match.kind === "ambiguous") {
            ambiguousTransfers += 1;
            diagnostics.push({
              event: "transfer_pair_ambiguous",
              session_id: `bank-sync-${account.id}`,
              user_id: userId,
              severity: "info",
              details: {
                bank_account_id: account.id,
                bank_transaction_id: stableId,
                candidate_ids: match.candidateIds,
              },
            });
          }
          if (match.kind === "pair") {
            const existing = (pairRows || []).find((r: any) => r.id === match.existingId);
            const patch: Record<string, unknown> = {
              counterpart_bank_transaction_id: stableId,
              counterpart_bank_raw_line: rawLine,
              transfer_counterpart_origin: "pair",
            };
            // Ručni redak (bez bankovnog ID-a) uparivanjem postaje potvrđen.
            if (existing && !existing.bank_transaction_id) {
              patch.bank_transaction_id = stableId;
              patch.bank_account_id = account.id;
              patch.bank_match_status = "confirmed";
              patch.bank_raw_line = rawLine;
              patch.bank_raw_line_source = "enable_banking";
            }
            // PRETVORBA: obični primitak/trošak JEST druga strana → postaje
            // prijenos. Strane slaže isključivo buildTransferPair.
            if (match.convert) {
              const counterpart =
                match.payerWalletId === statementWalletId
                  ? match.receiverWalletId
                  : match.payerWalletId;
              const pair = counterpart
                ? buildTransferPair({
                    statementSource: `custom:${statementWalletId}`,
                    counterpartSourceId: counterpart,
                    direction,
                  })
                : null;
              if (!pair) throw new Error("invalid_transfer_pair");
              patch.type = "transfer";
              patch.category = "transfer";
              patch.payment_source = pair.paymentSource;
              patch.income_source_id = pair.incomeSourceId;
            }
            // Ispravak platitelja samo kad je postojeći nastao po pravilu.
            if (match.correctedPayerFrom) {
              patch.payment_source = `custom:${match.payerWalletId}`;
              patch.transfer_counterpart_origin = decision.transfer.signal ?? "card";
            }
            const { error: pairUpdErr } = await admin
              .from("expenses")
              .update(patch)
              .eq("id", match.existingId);
            if (pairUpdErr) throw pairUpdErr;
            transfersPaired += 1;
            if (match.convert) pairsConverted += 1;
            claimedPairIds.add(match.existingId);
            if (match.correctedPayerFrom) {
              diagnostics.push({
                event: "transfer_payer_corrected",
                session_id: `bank-sync-${account.id}`,
                user_id: userId,
                severity: "info",
                details: {
                  expense_id: match.existingId,
                  from_wallet: match.correctedPayerFrom,
                  to_wallet: match.payerWalletId,
                  bank_transaction_id: stableId,
                },
              });
            }
            observeShadow("pair", {
              kind: "transfer",
              pairedExistingId: match.existingId,
            });
            continue;
          }
        } catch (pairFail: any) {
          errors += 1;
          diagnostics.push({
            event: "transfer_pair_failed",
            session_id: `bank-sync-${account.id}`,
            user_id: userId,
            severity: "error",
            details: {
              step: "transfer_pair_match",
              bank_account_id: account.id,
              bank_transaction_id: stableId,
              statement_wallet_id: statementWalletId,
              counterpart_wallet_id: counterpartWalletId,
              code: pairFail?.code ?? null,
              message: pairFail?.message ?? String(pairFail),
            },
          });
        }
      }

      // Proknjižena verzija onoga što je već upisano (ručni redak, redak iz
      // rezervacije, ručno pretvoren u prijenos) — AŽURIRAJ, ne dodavaj novi.
      // Retci koji već nose svoj proknjiženi bankovni ID se ne diraju.
      let bankRows: any[];
      if (decision.transfer) {
        const { data } = await buildMergeQuery(absAmount, txDate, decision);
        bankRows = (data || []) as any[];
      } else {
        bankRows = plainCandidateCache.get(rowIndex) ?? [];
      }

      for (const r of bankRows) {
        shadowCandidates.push({ id: r.id, userId: r.user_id, kind: "manual" });
      }

      const oldCandidates = countedCandidates(bankRows, stableId).map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        date: r.date,
        payment_source_card_id: r.payment_source_card_id,
        description: r.description,
        bank_transaction_id: r.bank_transaction_id,
        bank_match_status: r.bank_match_status,
        type: r.type,
      }));
      const oldTarget = {
        amount: absAmount,
        date: txDate,
        cardId: decision.paymentSourceCardId,
        counterparty: counterpartyOf(tx, description),
        description,
      };

      let mergeTarget: MergeCandidateRow | null = null;
      if (decision.transfer) {
        // PRIJENOS: doslovno stari put.
        mergeTarget = pickMergeTarget(oldCandidates, oldTarget);
      } else {
        // TROŠAK/PRIHOD: odlučuje pravilo „isti trošak"; kandidati tipa
        // prijenos (ručno pretvoreni) i dalje idu starim pickMergeTarget.
        const transferTarget = pickMergeTarget(
          oldCandidates.filter((c) => c.type === "transfer"),
          oldTarget,
        );
        const rule = sameExpensePlan.get(stableId);
        const used = new Set<string>([...mergedManualIds, ...claimedPairIds]);
        const choice = chooseSyncMerge(rule, transferTarget?.id ?? null, used);
        if (rule && (rule.outcome === "ambiguous" || rule.outcome === "uncertain")) {
          const passingIds = rule.passing.map((c) => c.id);
          shadow.noteSameExpenseUndecided({
            bank_transaction_id: stableId,
            candidate_ids: passingIds.length > 0
              ? passingIds
              : oldCandidates.filter((c) => c.type !== "transfer").map((c) => c.id),
            outcome: rule.outcome,
            reason: rule.reason,
          });
        }
        if (choice.kind !== "none") {
          mergeTarget = oldCandidates.find((c) => c.id === choice.id) ?? null;
        }
      }

      if (mergeTarget) {
        // Tip se ZADRŽAVA (prijenos ostaje prijenos), opis se ne prepisuje.
        const { error: mergeErr } = await admin
          .from("expenses")
          .update({
            bank_transaction_id: stableId,
            bank_account_id: account.id,
            date: new Date(txDate).toISOString(),
            bank_match_status: "confirmed",
            bank_raw_line: rawLine,
            bank_raw_line_source: "enable_banking",
            payment_source_card_id: decision.paymentSourceCardId ?? mergeTarget.payment_source_card_id ?? null,
          })
          .eq("id", mergeTarget.id);
        if (mergeErr) {
          console.warn("[bank-sync-transactions] merge update err", mergeErr.message);
          errors += 1;
        } else {
          mergedBooked += 1;
          mergedManualIds.add(mergeTarget.id);
        }
        observeShadow(
          "merge",
          { kind: "auto_merge", manualId: mergeTarget.id },
          { autoMergeOn: true },
        );
        continue;
      }


      // Prijenos između dva korisnikova novčanika — JEDAN redak s obje strane.
      // Par (payment_source, income_source_id) dolazi isključivo iz
      // buildTransferPair() unutar decideBankSyncRow; ovdje se samo zapisuje.
      if (decision.transfer) {
        const { error: trErr } = await admin.from("expenses").insert({
          user_id: userId,
          amount: absAmount,
          description,
          category: "other",
          type: "transfer",
          date: new Date(txDate).toISOString(),
          payment_source: decision.transfer.paymentSource,
          income_source_id: decision.transfer.incomeSourceId,
          payment_source_card_id: decision.paymentSourceCardId,
          currency: tx.transaction_amount?.currency || account.currency || "EUR",
          business_profile_id: rowBusinessProfileId,
          bank_transaction_id: stableId,
          bank_account_id: account.id,
          bank_match_status: "bank_only",
          bank_raw_line: rawLine,
          bank_raw_line_source: "enable_banking",
        });
        if (trErr) {
          if ((trErr as any).code === "23505") {
            skipped += 1;
          } else {
            console.warn("[bank-sync-transactions] transfer insert err", trErr.message);
            errors += 1;
          }
        } else {
          imported += 1;
          autoTransfers += 1;
        }
        observeShadow(
          "transfer",
          { kind: "transfer", pairedExistingId: null },
          { transferEnabled: true },
        );
        continue;
      }

      // Hybrid bank-first match logika (ručno upisani retci).
      const candidates = await findCandidates(absAmount, txDate, type as "expense" | "income");
      const center = new Date(txDate).getTime();

      for (const c of candidates as any[]) {
        shadowCandidates.push({ id: c.id, userId: c.user_id, kind: "manual" });
      }

      // Spajanje trošak/prihod s ručnim retkom odlučuje ISKLJUČIVO pravilo
      // „isti trošak" (gore). Ovi kandidati služe samo sjeni i oznaci
      // possible_duplicate_of — redak se upisuje kao novi, kao i dosad.
      // INSERT novi bank_only.
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
        payment_source_card_id: decision.paymentSourceCardId,
        currency: tx.transaction_amount?.currency || account.currency || "EUR",
        business_profile_id: rowBusinessProfileId,
        bank_transaction_id: stableId,
        bank_account_id: account.id,
        ai_extracted: category !== "other",
        bank_match_status: "bank_only",
        possible_duplicate_of: possibleDuplicateOf,
        bank_raw_line: rawLine,
        bank_raw_line_source: "enable_banking",
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
      observeShadow(
        "new",
        { kind: "new", existsByFingerprint: false, deletedByFingerprint: false },
        { newRowOn: true },
      );
    }

    // ── BANKIN SALDO JE ISTINA ────────────────────────────────────────────
    // Nakon obrade transakcija dohvati saldo iz banke, spremi sve vraćene
    // tipove sirovo i postavi sidro povezanog novčanika na bankin saldo.
    const syncedAt = new Date().toISOString();
    let balanceInfo: Record<string, unknown> | null = null;
    try {
      const balRes = await ebFetch(`/accounts/${encodeURIComponent(account.account_uid)}/balances`);
      const balText = await balRes.text();
      if (!balRes.ok) throw new Error(`balances_fetch_failed_${balRes.status}: ${balText.slice(0, 200)}`);
      const balJson = JSON.parse(balText);
      const list = balJson.balances ?? [];
      const picked = pickBankBalance(list);
      if (!picked) throw new Error("balances_no_usable_type");

      balanceInfo = {
        picked_amount: picked.amount,
        picked_balance_type: picked.balanceType,
        picked_reference_date: picked.referenceDate,
        fetched_at: syncedAt,
        balances: list,
      };

      await admin
        .from("bank_accounts")
        .update({
          balance: picked.amount,
          balance_updated_at: syncedAt,
          raw_payload: { ...((account as any).raw_payload ?? {}), balances_raw: balanceInfo },
        })
        .eq("id", account.id);

      // Sidro povezanog novčanika — isti mehanizam kao u bank-link-account.
      const sourceId = account.linked_payment_source_id;
      const { data: src } = await admin
        .from("custom_payment_sources")
        .select("correction_anchor_balance, correction_anchor_date, balance")
        .eq("id", sourceId)
        .maybeSingle();

      const { error: anchorErr } = await admin
        .from("custom_payment_sources")
        .update({
          correction_anchor_balance: picked.amount,
          correction_anchor_date: syncedAt,
          anchor_source: "bank_reconciliation",
        })
        .eq("id", sourceId);
      if (anchorErr) throw new Error(`anchor_update_failed: ${anchorErr.message}`);

      await admin.from("anchor_audit").insert({
        source_id: sourceId,
        user_id: userId,
        old_anchor_date: src?.correction_anchor_date ?? null,
        old_anchor_balance: src?.correction_anchor_balance ?? null,
        old_balance: src?.balance ?? null,
        new_anchor_date: syncedAt,
        new_anchor_balance: picked.amount,
        anchor_source: "bank_reconciliation",
        reason: "bank-sync: anchor from bank balance",
        actor: userId,
      });

      const { error: recErr } = await admin.rpc("recompute_custom_source_balance", {
        p_source_id: sourceId,
      });
      if (recErr) console.warn("[bank-sync-transactions] recompute err", recErr.message);
    } catch (balErr: any) {
      // Transakcije su obrađene; sidro ostaje nepromijenjeno.
      console.warn("[bank-sync-transactions] balances failed", balErr?.message ?? balErr);
      diagnostics.push({
        event: "bank_sync_balance_failed",
        session_id: `bank-sync-${account.id}`,
        user_id: userId,
        severity: "warning",
        details: {
          bank_account_id: account.id,
          payment_source: paymentSourceRef,
          error: String(balErr?.message ?? balErr),
        },
      });
    }

    // SJENA: jedan zbirni zapis po pokretanju, bez iznosa i opisa.
    try {
      const shadowLog = shadow.summaryLog();
      if (shadowLog) diagnostics.push(shadowLog);
    } catch (shadowFail: any) {
      console.warn("[bank-sync-transactions] shadow summary err", shadowFail?.message ?? shadowFail);
    }

    if (diagnostics.length > 0) {
      const { error: diagErr } = await admin.from("app_diagnostics_logs").insert(diagnostics);
      if (diagErr) console.warn("[bank-sync-transactions] diagnostics err", diagErr.message);
    }

    await admin
      .from("bank_accounts")
      .update({
        last_synced_at: syncedAt,
        last_sync_error: null,
      })
      .eq("id", account.id);


    return new Response(JSON.stringify({
      success: true,
      imported,
      skipped,
      errors,
      ai_categorized: aiCategorized,
      reservations_skipped: reservationsSkipped,
      needs_confirmation: needsConfirmation,
      merged_booked: mergedBooked,
      auto_transfers: autoTransfers,
      ambiguous_transfers: ambiguousTransfers,
      transfers_paired: transfersPaired,
      pairs_converted: pairsConverted,
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
