/**
 * notify-crash — instant email alert kad ErrorBoundary uhvati React crash.
 *
 * Public (verify_jwt = false) jer može biti pozvana i prije nego što je session
 * dostupna (npr. crash u boot fazi). Ako Authorization header postoji i
 * validan je, user_id se izvlači iz JWT-a. Payload `userId` polje se ignorira
 * (spriječava user-enumeration napade).
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
const MAX_PAYLOAD_BYTES = 32_768
const RATE_LIMIT_WINDOW_MS = 3_600_000
const RATE_LIMIT_MAX = 20

const VALID_SOURCES = ['error_boundary', 'window_error', 'unhandled_rejection'] as const
type CrashSource = typeof VALID_SOURCES[number]

interface NotifyCrashBody {
  source?: string
  message?: string
  stack?: string
  componentStack?: string
  route?: string
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

async function hashIp(ip: string): Promise<string> {
  const enc = new TextEncoder().encode(`crash-rl:${ip}`)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // 1. Payload size guard (pre-parse)
  const contentLength = Number(req.headers.get('content-length') || '0')
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: 'payload_too_large' }), {
      status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: NotifyCrashBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Source whitelist
  const source: CrashSource = (VALID_SOURCES as readonly string[]).includes(body.source ?? '')
    ? (body.source as CrashSource)
    : 'error_boundary'

  // 3. Route sanitisation (strip javascript:/data: URIs, cap length)
  const rawRoute = typeof body.route === 'string' ? body.route : null
  const route = rawRoute
    ? rawRoute.slice(0, 500).replace(/^(javascript:|data:)/i, '')
    : null

  const message = firstLine(body.message)
  const signature = buildSignature(source, message, route)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // 4. userId from JWT only (never from payload) — prevents email enumeration
  let userId: string | undefined
  let userEmail: string | undefined
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice('Bearer '.length)
      const { data: claimsData } = await admin.auth.getClaims(token)
      const sub = claimsData?.claims?.sub as string | undefined
      if (sub) {
        userId = sub
        const { data: u } = await admin.auth.admin.getUserById(sub)
        userEmail = u?.user?.email ?? undefined
      }
    } catch {
      // ignore — anonymous crash report
    }
  }

  // 5. Rate limit per IP hash — count alert rows in last hour with matching ip_hash
  const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = await hashIp(ipRaw)
  const rateSinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

  const { count: rlCount } = await admin
    .from('monitor_alerts_log')
    .select('id', { count: 'exact', head: true })
    .eq('details->>ip_hash', ipHash)
    .gte('triggered_at', rateSinceIso)

  if ((rlCount ?? 0) >= RATE_LIMIT_MAX) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

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

  // Insert alert log row (with ip_hash for future rate limiting)
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
        ip_hash: ipHash,
      },
    })
    .select('id')
    .single()

  const alertId = insertedRows?.id

  const admins = await getAdminEmails(admin)
  const adminUrl = `${PUBLIC_BASE_URL.replace(/\/$/, '')}/admin?tab=pulse&alert=${alertId ?? ''}`

  const payload: CrashAlertPayload = {
    occurredAt: new Date().toISOString(),
    source,
    message,
    stack: body.stack,
    componentStack: body.componentStack,
    route: route ?? undefined,
    userId,
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
