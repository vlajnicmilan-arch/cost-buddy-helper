/**
 * notify-crash — instant email alert kad ErrorBoundary uhvati React crash.
 *
 * Razlog odvojene funkcije od cron monitor-app-health:
 *  - cron skenira svakih 5 min iz baze; predugo za pravi crash
 *  - ova ide direktno iz browsera čim ErrorBoundary klikne
 *  - dedup po signature (60 min) preko monitor_alerts_log
 *
 * Public (verify_jwt = false) jer može biti pozvana i prije nego što je session
 * dostupna (npr. crash u boot fazi). user_id se prima u payloadu opcijski.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  enqueueCrashAlertEmail,
  getAdminEmails,
  type CrashAlertPayload,
} from '../_shared/sendCrashAlert.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://vmbalance.com'
const DEDUP_MIN = 60

interface NotifyCrashBody {
  source?: 'error_boundary' | 'window_error' | 'unhandled_rejection'
  message?: string
  stack?: string
  componentStack?: string
  route?: string
  userId?: string | null
  appVersion?: string
  platform?: string
}

const firstLine = (s: string | undefined | null) => {
  if (!s) return '(no message)'
  const t = String(s).split('\n')[0].trim()
  return t.length > 200 ? t.slice(0, 200) : t
}

const buildSignature = (source: string, msg: string, route: string | null) =>
  `${source}|${route ?? '?'}|${msg}`.toLowerCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  let body: NotifyCrashBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const source = body.source ?? 'error_boundary'
  const message = firstLine(body.message)
  const route = body.route ?? null
  const signature = buildSignature(source, message, route)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // Dedup: ako je isti signature već prijavljen u zadnjih DEDUP_MIN min, odustani.
  const dedupSinceIso = new Date(Date.now() - DEDUP_MIN * 60_000).toISOString()
  const { data: recent } = await admin
    .from('monitor_alerts_log')
    .select('id')
    .eq('alert_signature', signature)
    .gte('triggered_at', dedupSinceIso)
    .limit(1)

  if (recent && recent.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, deduped: true, signature }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Resolve user email if userId provided
  let userEmail: string | undefined
  if (body.userId) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(body.userId)
      userEmail = u?.user?.email ?? undefined
    } catch {
      // ignore
    }
  }

  // Insert alert log row
  const { data: insertedRows } = await admin
    .from('monitor_alerts_log')
    .insert({
      alert_signature: signature,
      error_count: 1,
      affected_users: 1,
      sample_message: message,
      sample_route: route,
      source,
      details: {
        source,
        stack_preview: (body.stack ?? '').slice(0, 500),
        app_version: body.appVersion,
        platform: body.platform,
      },
    })
    .select('id')
    .single()

  const alertId = insertedRows?.id

  // Get admin emails and send
  const admins = await getAdminEmails(admin)
  const adminUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/admin?tab=pulse&alert=${alertId ?? ''}`

  const payload: CrashAlertPayload = {
    occurredAt: new Date().toISOString(),
    source,
    message,
    stack: body.stack,
    componentStack: body.componentStack,
    route: route ?? undefined,
    userId: body.userId ?? undefined,
    userEmail,
    appVersion: body.appVersion,
    platform: body.platform,
    signature,
    errorCount: 1,
    affectedUsers: 1,
    adminUrl,
  }

  let sent = 0
  for (const a of admins) {
    const idempotencyKey = `crash-${signature.slice(0, 80)}-${a.userId}-${Math.floor(Date.now() / 3_600_000)}`
    const res = await enqueueCrashAlertEmail(admin, a.email, payload, idempotencyKey)
    if (res.ok) sent += 1
  }

  if (alertId && sent > 0) {
    await admin
      .from('monitor_alerts_log')
      .update({ notified_email: true })
      .eq('id', alertId)
  }

  return new Response(
    JSON.stringify({ ok: true, alert_id: alertId, admins_notified: sent, signature }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
