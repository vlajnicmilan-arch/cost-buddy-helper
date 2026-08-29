// Notifies administrators (and only them) about a new signup.
// Triggered by an AFTER INSERT trigger on public.profiles (fire-and-forget via pg_net),
// so a failure here can never break the signup flow.

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { sendPushNotification } from '../_shared/sendPushNotification.ts'
import {
  buildSignupMessage,
  buildSignupPushBody,
  buildSummaryMessage,
  decideSignupDelivery,
  extractUtm,
  formatSignupSource,
  summaryDedupKey,
} from '../_shared/adminSignupNotice.ts'

const SITE_NAME = 'Centar'
const SENDER_DOMAIN = 'notify.vmbalance.com'
const FROM_DOMAIN = 'notify.vmbalance.com'
const NOTIFICATION_TYPE = 'admin_new_signup'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL =
  Deno.env.get('SIGNUP_ADMIN_EMAIL') || Deno.env.get('FEEDBACK_ADMIN_EMAIL') || 'support@vmbalance.com'
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://vmbalance.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'missing_user_id' }, 400)

  // 1) The new user (service role bypasses RLS; data never leaves this function
  //    except into the admin-only notification / e-mail).
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, created_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) return json({ error: 'profile_not_found' }, 404)

  const occurredAt = profile.created_at || new Date().toISOString()

  let userEmail: string | undefined
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    userEmail = authUser?.user?.email || undefined
  } catch (err) {
    console.warn('[notify-admin-signup] auth lookup failed', err)
  }

  // 2) Traffic source from the signup funnel event (never modified here).
  let source = 'izravno'
  try {
    const { data: ev } = await admin
      .from('funnel_events')
      .select('metadata, occurred_at')
      .eq('user_id', userId)
      .eq('event_name', 'signup')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ev) source = formatSignupSource(extractUtm(ev.metadata))
  } catch (err) {
    console.warn('[notify-admin-signup] funnel lookup failed', err)
  }

  // 3) Recipients = admins only.
  const { data: admins, error: adminsErr } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')

  if (adminsErr) return json({ error: 'admins_lookup_failed', detail: adminsErr.message }, 500)
  const adminIds = [...new Set((admins ?? []).map((r) => r.user_id as string))].filter(
    (id) => id !== userId,
  )

  const dayIso = new Date().toISOString().slice(0, 10)
  const dayStart = `${dayIso}T00:00:00.000Z`
  const dedupKey = summaryDedupKey(dayIso)
  const message = buildSignupMessage({ displayName: profile.display_name, occurredAt, source })

  let individualCount = 0
  let summaryCount = 0

  for (const adminId of adminIds) {
    try {
      const { count: priorIndividual } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', adminId)
        .eq('type', NOTIFICATION_TYPE)
        .is('dedup_key', null)
        .gte('created_at', dayStart)

      const { data: summaryRow } = await admin
        .from('notifications')
        .select('id, recurrence_count')
        .eq('user_id', adminId)
        .eq('type', NOTIFICATION_TYPE)
        .eq('dedup_key', dedupKey)
        .maybeSingle()

      const decision = decideSignupDelivery(priorIndividual ?? 0, !!summaryRow)

      if (decision.mode === 'individual') {
        await admin.from('notifications').insert({
          user_id: adminId,
          type: NOTIFICATION_TYPE,
          title: 'Nova registracija',
          message,
          severity: 'info',
          data: { new_user_id: userId, source, occurred_at: occurredAt },
        })
        individualCount++
      } else if (decision.mode === 'summary_new') {
        await admin.from('notifications').insert({
          user_id: adminId,
          type: NOTIFICATION_TYPE,
          title: 'Nova registracija',
          message: buildSummaryMessage(1),
          severity: 'info',
          dedup_key: dedupKey,
          recurrence_count: 1,
          data: { source, summary: true, day: dayIso },
        })
        summaryCount++
      } else if (summaryRow) {
        const next = (summaryRow.recurrence_count ?? 1) + 1
        await admin
          .from('notifications')
          .update({
            message: buildSummaryMessage(next),
            recurrence_count: next,
            read: false,
            last_seen_at: new Date().toISOString(),
            data: { source, summary: true, day: dayIso },
          })
          .eq('id', summaryRow.id)
        summaryCount++
      }

      if (decision.push) {
        // Lock-screen safe: no name, no e-mail.
        await sendPushNotification({
          user_id: adminId,
          title: 'Nova registracija',
          body: buildSignupPushBody(source),
          data: { type: NOTIFICATION_TYPE },
          source: 'notify-admin-signup',
        })
      }
    } catch (err) {
      console.warn('[notify-admin-signup] admin delivery failed', adminId, err)
    }
  }

  // 4) Transactional e-mail to the admin mailbox (no unsubscribe link).
  let emailOk = false
  try {
    const tpl = TEMPLATES['admin-new-signup']
    if (!tpl) throw new Error('template_not_found')

    const templateData = {
      userName: profile.display_name || undefined,
      userEmail,
      source,
      occurredAt,
      adminUrl: `${PUBLIC_BASE_URL.replace(/\/$/, '')}/admin`,
    }

    const html = await renderAsync(React.createElement(tpl.component, templateData))
    const text = await renderAsync(React.createElement(tpl.component, templateData), { plainText: true })
    const subject = typeof tpl.subject === 'function' ? tpl.subject(templateData) : tpl.subject

    const recipient = (tpl as any).to || ADMIN_EMAIL
    const messageId = crypto.randomUUID()

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'admin-new-signup',
      recipient_email: recipient,
      status: 'pending',
    })

    const { error: enqueueError } = await admin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'admin-new-signup',
        idempotency_key: `admin-new-signup-${userId}`,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.warn('[notify-admin-signup] enqueue failed', enqueueError)
      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'admin-new-signup',
        recipient_email: recipient,
        status: 'failed',
        error_message: enqueueError.message,
      })
    } else {
      emailOk = true
    }
  } catch (err) {
    console.warn('[notify-admin-signup] email exception', err)
  }

  return json({ ok: true, admins: adminIds.length, individualCount, summaryCount, email_sent: emailOk })
})
