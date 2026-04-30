import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRACE_PERIOD_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;
    const userEmail = claims.claims.email as string | undefined;

    const body = await req.json().catch(() => ({}));
    const reason: string | null = body?.reason ?? null;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Provjera već postojećeg pending zahtjeva
    const { data: existing } = await admin
      .from("account_deletion_log")
      .select("id, scheduled_for")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        already_scheduled: true,
        scheduled_for: existing.scheduled_for,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + GRACE_PERIOD_DAYS);

    // Markiraj profil kao scheduled for deletion
    await admin.from("profiles").update({
      deletion_scheduled_at: scheduledFor.toISOString(),
    }).eq("user_id", userId);

    // Kreiraj log
    const { data: logRow, error: logErr } = await admin
      .from("account_deletion_log")
      .insert({
        user_id: userId,
        user_email: userEmail,
        scheduled_for: scheduledFor.toISOString(),
        reason,
        status: "pending",
      })
      .select()
      .single();

    if (logErr) throw logErr;

    // Pošalji potvrdni email (ne blokirati ako padne)
    if (userEmail) {
      try {
        await admin.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'account-deletion-scheduled',
            recipientEmail: userEmail,
            idempotencyKey: `deletion-scheduled-${logRow.id}`,
            templateData: {
              scheduledDate: scheduledFor.toLocaleDateString('hr-HR'),
              graceDays: GRACE_PERIOD_DAYS,
            },
          },
        });
      } catch (e) {
        console.error('[email] scheduled notification failed:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      scheduled_for: scheduledFor.toISOString(),
      grace_period_days: GRACE_PERIOD_DAYS,
      log_id: logRow.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[request-account-deletion]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
