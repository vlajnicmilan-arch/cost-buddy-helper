import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = Deno.env.get('FEEDBACK_ADMIN_EMAIL') || 'support@vmbalance.com'
const WEBHOOK_URL = Deno.env.get('FEEDBACK_WEBHOOK_URL') || ''
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://vmbalance.com'

interface NotifyBody {
  feedbackId: string
}

const labelForType = (t?: string) => {
  switch (t) {
    case 'bug': return '🐛 Bug'
    case 'idea': return '💡 Idea'
    case 'question': return '❓ Question'
    default: return t || 'Feedback'
  }
}

async function postWebhook(payload: any): Promise<void> {
  if (!WEBHOOK_URL) return
  // Detect Slack vs Discord vs generic
  let body: any
  if (WEBHOOK_URL.includes('hooks.slack.com')) {
    body = { text: payload.text, blocks: payload.slackBlocks }
  } else if (WEBHOOK_URL.includes('discord.com/api/webhooks') || WEBHOOK_URL.includes('discordapp.com/api/webhooks')) {
    body = { content: payload.text, embeds: payload.discordEmbeds }
  } else {
    body = payload
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn('[notify-feedback-admin] webhook non-2xx', res.status, await res.text())
    }
  } catch (err) {
    console.warn('[notify-feedback-admin] webhook failed', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let body: NotifyBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!body.feedbackId || typeof body.feedbackId !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_feedbackId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // Fetch feedback row (service role bypasses RLS)
  const { data: fb, error: fbErr } = await admin
    .from('feedback_submissions')
    .select('id, type, message, rating, route, app_version, viewport, platform, user_agent, language, console_tail, email, user_id, created_at')
    .eq('id', body.feedbackId)
    .maybeSingle()

  if (fbErr || !fb) {
    return new Response(JSON.stringify({ error: 'feedback_not_found', detail: fbErr?.message }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Resolve submitter display name
  let userName: string | undefined
  if (fb.user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', fb.user_id)
      .maybeSingle()
    userName = profile?.display_name || undefined
  }

  const consoleTailCount = Array.isArray(fb.console_tail) ? fb.console_tail.length : 0
  const adminUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/admin?tab=feedback&id=${fb.id}`

  // 1) Email to admin (direct fetch — invoke() overrides Authorization with anon key)
  let emailOk = false
  try {
    const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        templateName: 'feedback-admin-alert',
        recipientEmail: ADMIN_EMAIL,
        idempotencyKey: `feedback-alert-${fb.id}`,
        templateData: {
          type: fb.type,
          message: fb.message,
          rating: fb.rating,
          route: fb.route,
          appVersion: fb.app_version,
          viewport: fb.viewport,
          platform: fb.platform,
          userEmail: fb.email,
          userName,
          consoleTailCount,
          feedbackId: fb.id,
          adminUrl,
        },
      }),
    })
    emailOk = emailResp.ok
    if (!emailResp.ok) {
      const txt = await emailResp.text().catch(() => '')
      console.warn('[notify-feedback-admin] email non-2xx', emailResp.status, txt)
    }
  } catch (err) {
    console.warn('[notify-feedback-admin] email exception', err)
  }

  // 2) Webhook (optional)
  const summary = `${labelForType(fb.type)} · ${(fb.message || '').slice(0, 200)}`
  const submitter = userName || fb.email || 'Anonymous'
  await postWebhook({
    text: `*New feedback*: ${summary}\n_${submitter} on ${fb.route || '?'} · ${adminUrl}_`,
    slackBlocks: [
      { type: 'header', text: { type: 'plain_text', text: `New feedback: ${labelForType(fb.type)}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${(fb.message || '').slice(0, 1500)}*` } },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `From: ${submitter}` },
          { type: 'mrkdwn', text: `Route: ${fb.route || '—'}` },
          { type: 'mrkdwn', text: `${fb.app_version || '—'} · ${fb.viewport || '—'}` },
        ],
      },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open admin' }, url: adminUrl }] },
    ],
    discordEmbeds: [
      {
        title: `New feedback: ${labelForType(fb.type)}`,
        description: (fb.message || '').slice(0, 1800),
        url: adminUrl,
        color: fb.type === 'bug' ? 0xef4444 : fb.type === 'idea' ? 0xeab308 : 0x22a39c,
        fields: [
          { name: 'From', value: submitter, inline: true },
          { name: 'Route', value: fb.route || '—', inline: true },
          { name: 'Version / Viewport', value: `${fb.app_version || '—'} · ${fb.viewport || '—'}`, inline: false },
        ],
        timestamp: fb.created_at,
      },
    ],
  })

  return new Response(
    JSON.stringify({ ok: true, email_sent: emailOk, webhook: !!WEBHOOK_URL }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
