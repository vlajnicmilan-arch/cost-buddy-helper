/**
 * Shared helper za slanje crash-alert emaila adminima.
 * Koriste ga: notify-crash (instant kanal iz ErrorBoundary) i monitor-app-health (cron kanal).
 *
 * Koristi postojeću email infrastrukturu (enqueue_email RPC + transactional_emails queue).
 * Ne poziva send-transactional-email edge funkciju jer treba bypass-ati gateway JWT
 * (isti razlog kao notify-feedback-admin) i jer slanje ide servisnim ključem za admin email.
 */

// deno-lint-ignore-file no-explicit-any
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

const SITE_NAME = 'Centar'
const SENDER_DOMAIN = 'notify.vmbalance.com'
const FROM_DOMAIN = 'notify.vmbalance.com'

export interface CrashAlertPayload {
  occurredAt?: string
  source: 'error_boundary' | 'window_error' | 'unhandled_rejection' | 'cron'
  message: string
  stack?: string
  componentStack?: string
  route?: string
  userId?: string
  userEmail?: string
  appVersion?: string
  platform?: string
  signature: string
  errorCount?: number
  affectedUsers?: number
  adminUrl?: string
}

async function getOrCreateUnsubscribeToken(
  admin: any,
  recipient: string,
): Promise<string> {
  const normalized = recipient.toLowerCase()
  const { data: existing } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()
  if (existing?.token) return existing.token

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  await admin
    .from('email_unsubscribe_tokens')
    .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()
  return stored?.token ?? token
}

/**
 * Dohvati sve admin email-ove (preko user_roles + auth.users).
 * Koristi service role klijent (bypass RLS).
 */
export async function getAdminEmails(admin: any): Promise<Array<{ userId: string; email: string }>> {
  const { data: roles, error: rolesErr } = await admin
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')
  if (rolesErr || !roles?.length) {
    console.warn('[crash-alert] no admin roles found', rolesErr)
    return []
  }

  const out: Array<{ userId: string; email: string }> = []
  for (const r of roles) {
    try {
      const { data: u } = await admin.auth.admin.getUserById(r.user_id)
      const email = u?.user?.email
      if (email) out.push({ userId: r.user_id, email })
    } catch (e) {
      console.warn('[crash-alert] getUserById failed', r.user_id, e)
    }
  }
  return out
}

/**
 * Pošalji crash-alert email jednom recipient-u kroz transactional_emails queue.
 * Idempotency key osigurava da isti signature unutar istog sata ne ide više puta.
 */
export async function enqueueCrashAlertEmail(
  admin: any,
  recipient: string,
  payload: CrashAlertPayload,
  idempotencyKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const tpl = TEMPLATES['crash-alert']
    if (!tpl) return { ok: false, error: 'template_not_found' }

    const html = await renderAsync(React.createElement(tpl.component, payload))
    const text = await renderAsync(React.createElement(tpl.component, payload), { plainText: true })
    const subject =
      typeof tpl.subject === 'function' ? tpl.subject(payload) : tpl.subject

    const messageId = crypto.randomUUID()

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'crash-alert',
      recipient_email: recipient,
      status: 'pending',
    })

    const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, recipient)

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
        label: 'crash-alert',
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'crash-alert',
        recipient_email: recipient,
        status: 'failed',
        error_message: enqueueError.message,
      })
      return { ok: false, error: enqueueError.message }
    }

    return { ok: true }
  } catch (err) {
    console.warn('[crash-alert] exception sending to', recipient, err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
