import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRIAL-REMINDER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Stvarno probno razdoblje živi po modulu u `user_entitlements`
    // (source='trial'). Podsjetnik ide 2 dana prije `period_end`.
    const now = new Date();
    const windowStart = new Date(now.getTime() + 2 * 86400000);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    logStep("Looking for trials ending between", {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    });

    const { data: trials, error: trialsError } = await supabase
      .from("user_entitlements")
      .select("user_id, module, period_end")
      .eq("source", "trial")
      .eq("status", "active")
      .gte("period_end", windowStart.toISOString())
      .lte("period_end", windowEnd.toISOString());

    if (trialsError) throw new Error(`Failed to read entitlements: ${trialsError.message}`);

    logStep(`Found ${trials?.length ?? 0} trials expiring in 2 days`);

    if (!trials || trials.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No trials expiring in 2 days" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MODULE_LABEL: Record<string, string> = {
      smjer: "Smjer",
      krug: "Krug",
      projekti: "Projekti",
      biznis: "Biznis",
    };

    let remindersSent = 0;

    for (const trial of trials) {
      // Ako korisnik za taj isti modul već ima plaćeno pravo — preskoči.
      const { data: paid } = await supabase
        .from("user_entitlements")
        .select("id")
        .eq("user_id", trial.user_id)
        .eq("module", trial.module)
        .eq("status", "active")
        .neq("source", "trial")
        .limit(1);

      if (paid && paid.length > 0) {
        logStep(`Skipping ${trial.user_id} / ${trial.module} — already entitled`);
        continue;
      }

      const { data: userRes } = await supabase.auth.admin.getUserById(trial.user_id);
      const email = userRes?.user?.email;
      if (!email) {
        logStep(`Skipping ${trial.user_id} — no email`);
        continue;
      }

      const moduleLabel = MODULE_LABEL[trial.module] ?? trial.module;
      const emailHtml = generateTrialReminderEmail(moduleLabel);

      try {
        await supabase.rpc("enqueue_email", {
          p_message_id: `trial-reminder-${trial.user_id}-${trial.module}-${now.toISOString().split("T")[0]}`,
          p_queue_name: "transactional_emails",
          p_to: email,
          p_subject: `⏰ Probno razdoblje za ${moduleLabel} ističe za 2 dana`,
          p_html: emailHtml,
          p_from_name: "VMBalance",
          p_from_email: `noreply@notify.vmbalance.com`,
        });
        remindersSent++;
        logStep(`Enqueued reminder for ${trial.user_id} / ${trial.module}`);
      } catch (emailErr) {
        logStep(`Failed to enqueue email for ${trial.user_id}`, { error: String(emailErr) });
      }
    }

    logStep(`Done. Sent ${remindersSent} reminders`);

    return new Response(JSON.stringify({ sent: remindersSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function generateTrialReminderEmail(moduleLabel: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:hsl(199,89%,48%);padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
                ⏰ Probno razdoblje ističe za 2 dana
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Pozdrav,
              </p>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Probno razdoblje za modul <strong>${moduleLabel}</strong> završava za <strong>2 dana</strong>.
                Nakon isteka aplikacija ostaje dostupna na besplatnoj razini, a značajke tog modula se zaključavaju.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Ako želite nastaviti bez prekida, otključajte modul:
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://cost-buddy-helper.lovable.app/paywall" 
                       style="display:inline-block;background-color:hsl(199,89%,48%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
                      Otključaj modul →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.5;text-align:center;">
                Bez obveze — ako ne otključate modul, račun ostaje besplatan.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">
                VMBalance · Vaš osobni financijski asistent
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
