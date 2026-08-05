// Public callback endpoint hit by Enable Banking after user authorizes the bank.
// verify_jwt = false (configured in supabase/config.toml)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ebFetch } from "../_shared/enableBankingJwt.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";

// Target origin for postMessage — never "*", so only the app can read the result.
const APP_ORIGIN = Deno.env.get("PUBLIC_APP_URL") || "https://vmbalance.com";

function htmlPage(title: string, message: string, ok: boolean): Response {
  // Returns a small HTML that posts a message to opener (web) or just shows status (native).
  // title/message are always escaped here so no caller can inject markup.
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const html = `<!DOCTYPE html><html lang="hr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.card{max-width:420px;background:#1e293b;border-radius:16px;padding:32px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
h1{margin:0 0 12px;font-size:20px;color:${ok ? "hsl(172 66% 45%)" : "#f87171"}}
p{margin:0 0 20px;color:#cbd5e1;line-height:1.5;font-size:14px}
a{color:hsl(172 66% 50%);text-decoration:none;font-weight:500}
</style></head><body>
<div class="card">
<h1>${safeTitle}</h1>
<p>${safeMessage}</p>
<p><a href="/wallet">Otvori novčanik &rarr;</a></p>
</div>
<script>
try { window.opener && window.opener.postMessage({ type: 'enable_banking_callback', ok: ${ok} }, '*'); } catch(e){}
setTimeout(() => { try { window.location.href = '/wallet?bank_connected=${ok ? 1 : 0}'; } catch(e){} }, 2500);
</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.warn("[bank-connect-complete] bank returned error", error);
      return htmlPage(
        "Spajanje otkazano",
        `Banka je vratila grešku: ${error}. Možete pokušati ponovno iz aplikacije.`,
        false
      );
    }

    if (!code || !state) {
      return htmlPage("Greška", "Nedostaje code ili state parametar.", false);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find pending connection by state
    const { data: conn, error: connErr } = await admin
      .from("bank_connections")
      .select("id, user_id, aspsp_name, aspsp_country, business_profile_id")
      .eq("state_token", state)
      .eq("status", "pending")
      .maybeSingle();

    if (connErr || !conn) {
      console.error("[bank-connect-complete] state not found", state, connErr);
      return htmlPage("Sesija nije pronađena", "State token nije valjan ili je već iskorišten.", false);
    }

    // Exchange code for session
    const sessRes = await ebFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const sessText = await sessRes.text();
    if (!sessRes.ok) {
      console.error("[bank-connect-complete] session exchange failed", sessRes.status, sessText);
      await admin
        .from("bank_connections")
        .update({ status: "failed", last_error: sessText.slice(0, 500) })
        .eq("id", conn.id);
      return htmlPage("Spajanje neuspješno", "Razmjena tokena nije uspjela.", false);
    }
    const session = JSON.parse(sessText);
    const sessionId: string = session.session_id;
    let accounts: any[] = session.accounts ?? [];
    const validUntil: string | null = session.access?.valid_until ?? null;

    // Fallback: neke autorizacije vrate session s praznim `accounts`.
    // GET /sessions/{id} vraća `accounts` (lista UID stringova) i `accounts_data`
    // (SessionAccount: { uid, identification_hash, ... }) — bez iban/name/currency,
    // pa detalje dohvaćamo per račun preko GET /accounts/{uid}/details.
    if (accounts.length === 0 && sessionId) {
      try {
        const sRes = await ebFetch(`/sessions/${encodeURIComponent(sessionId)}`);
        if (sRes.ok) {
          const sData = await sRes.json();
          const uids: string[] = Array.isArray(sData.accounts_data) && sData.accounts_data.length > 0
            ? sData.accounts_data.map((a: any) => a?.uid).filter(Boolean)
            : (Array.isArray(sData.accounts) ? sData.accounts.map((a: any) => (typeof a === "string" ? a : a?.uid)).filter(Boolean) : []);

          const normalized: any[] = [];
          for (const uid of uids) {
            let details: any = null;
            try {
              const dRes = await ebFetch(`/accounts/${encodeURIComponent(uid)}/details`);
              if (dRes.ok) {
                details = await dRes.json();
              } else {
                console.warn("[bank-connect-complete] details fetch", uid, dRes.status);
              }
            } catch (e) {
              console.warn("[bank-connect-complete] details err", uid, e);
            }
            // Nikad ne preskačemo račun zbog manjka detalja.
            normalized.push({ ...(details ?? {}), uid, currency: details?.currency ?? "EUR" });
          }
          accounts = normalized;
        } else {
          console.warn("[bank-connect-complete] session refetch", sRes.status);
        }
      } catch (e) {
        console.warn("[bank-connect-complete] session refetch err", e);
      }
      if (accounts.length === 0) {
        console.warn("[bank-connect-complete] accounts empty after session refetch");
      }
    }

    // Update connection
    await admin
      .from("bank_connections")
      .update({
        status: "active",
        session_id: sessionId,
        valid_until: validUntil,
        last_error: null,
      })
      .eq("id", conn.id);

    // Insert accounts (idempotent on connection_id+account_uid)
    if (accounts.length > 0) {
      const rows = accounts.map((a: any) => ({
        connection_id: conn.id,
        user_id: conn.user_id,
        business_profile_id: conn.business_profile_id ?? null,
        account_uid: a.uid ?? a.account_id ?? crypto.randomUUID(),
        iban: a.account_id?.iban ?? a.iban ?? null,
        name: a.name ?? a.product ?? null,
        product: a.product ?? null,
        currency: a.currency ?? "EUR",
        raw_payload: a,
      }));
      const { error: accErr } = await admin
        .from("bank_accounts")
        .upsert(rows, { onConflict: "connection_id,account_uid" });
      if (accErr) {
        console.error("[bank-connect-complete] accounts upsert err", accErr);
      }

      // Try to fetch balances per account (best-effort)
      for (const acc of accounts) {
        const accountUid = acc.uid ?? acc.account_id;
        if (!accountUid) continue;
        try {
          const balRes = await ebFetch(`/accounts/${encodeURIComponent(accountUid)}/balances`);
          if (balRes.ok) {
            const bal = await balRes.json();
            const interim = bal.balances?.find((b: any) => b.balance_type === "INTERIM_AVAILABLE")
              ?? bal.balances?.find((b: any) => b.balance_type === "CLOSING_BOOKED")
              ?? bal.balances?.[0];
            if (interim) {
              await admin
                .from("bank_accounts")
                .update({
                  balance: parseFloat(interim.balance_amount?.amount ?? "0"),
                  balance_updated_at: new Date().toISOString(),
                })
                .eq("connection_id", conn.id)
                .eq("account_uid", accountUid);
            }
          } else {
            console.warn("[bank-connect-complete] balance fetch", accountUid, balRes.status);
          }
        } catch (e) {
          console.warn("[bank-connect-complete] balance err", e);
        }
      }
    }

    return htmlPage(
      "Banka je spojena",
      `Uspješno ste spojili ${conn.aspsp_name}. Pronađeno računa: ${accounts.length}.`,
      true
    );
  } catch (err: any) {
    console.error("[bank-connect-complete] exception", err);
    return htmlPage("Greška", err.message ?? String(err), false);
  }
});
