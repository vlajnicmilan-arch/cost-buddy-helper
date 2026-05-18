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

    // Trial is 30 days. Find users created exactly 28 days ago (2 days remaining)
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - 28);
    
    // Window: users created between 28 days ago 00:00 and 28 days ago 23:59
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    logStep("Checking users created between", { start: startOfDay.toISOString(), end: endOfDay.toISOString() });

    // Get users created 28 days ago via auth.admin
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) throw new Error(`Failed to list users: ${usersError.message}`);

    const eligibleUsers = usersData.users.filter(u => {
      const createdAt = new Date(u.created_at);
      return createdAt >= startOfDay && createdAt <= endOfDay;
    });

    logStep(`Found ${eligibleUsers.length} users in trial day 28`);

    if (eligibleUsers.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No users need reminders today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check which of these users already have an active subscription
    let remindersSent = 0;

    for (const user of eligibleUsers) {
      // Check if user has active subscription
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sub && sub.tier !== "free") {
        logStep(`Skipping user ${user.id} - already subscribed (${sub.tier})`);
        continue;
      }

      // Enqueue reminder email
      const emailHtml = generateTrialReminderEmail(user.email || "");
      
      try {
        await supabase.rpc("enqueue_email", {
          p_message_id: `trial-reminder-${user.id}-${now.toISOString().split('T')[0]}`,
          p_queue_name: "transactional_emails",
          p_to: user.email,
          p_subject: "⏰ Vaš trial ističe za 2 dana — odaberite plan",
          p_html: emailHtml,
          p_from_name: "VMBalance",
          p_from_email: `noreply@notify.vmbalance.com`,
        });
        remindersSent++;
        logStep(`Enqueued reminder for user ${user.id}`);
      } catch (emailErr) {
        logStep(`Failed to enqueue email for ${user.id}`, { error: String(emailErr) });
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

function generateTrialReminderEmail(email: string): string {
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
                ⏰ Vaš trial ističe za 2 dana
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
                Vaš besplatni probni period na <strong>VMBalance</strong> završava za <strong>2 dana</strong>. 
                Nakon isteka, pristup naprednim značajkama bit će ograničen.
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Odaberite plan koji vam odgovara i nastavite koristiti sve značajke bez prekida:
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://cost-buddy-helper.lovable.app/paywall" 
                       style="display:inline-block;background-color:hsl(199,89%,48%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;">
                      Odaberi plan →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#71717a;font-size:13px;line-height:1.5;text-align:center;">
                Pro plan već od <strong>4,99 €/mj</strong> — uključuje AI kategorizaciju, 
                neograničene transakcije, budžete i još mnogo toga.
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
