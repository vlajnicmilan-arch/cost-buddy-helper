import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Sends automatic informal payment reminders for overdue invoices at
// fixed stages: 3, 7 and 14 days past due_date. Triggered by pg_cron daily.
//
// Constraints:
// - Only invoices with auto_reminders_enabled=true AND client_email set
// - Skip cancelled / fully paid (paid amount >= total)
// - Skip if reminder for the same (invoice, stage, 'auto') already exists
// - No PDF attachment in auto mode (PDF generation requires browser DOM);
//   manual reminders from UI still include a signed PDF link.

const STAGES = [3, 7, 14] as const

function formatDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${dt.getFullYear()}`
}

function formatAmount(n: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('hr-HR', { style: 'currency', currency }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  // Pull all candidate invoices in one query.
  const { data: invoices, error } = await supabase
    .from('project_invoices')
    .select('id, user_id, business_profile_id, invoice_number, client_name, client_email, issue_date, due_date, total_amount, currency, status, auto_reminders_enabled')
    .eq('auto_reminders_enabled', true)
    .not('client_email', 'is', null)
    .not('due_date', 'is', null)
    .neq('status', 'cancelled')
    .neq('status', 'paid')

  if (error) {
    console.error('Failed to fetch invoices', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const list = invoices || []
  if (list.length === 0) {
    return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const invoiceIds = list.map((i: any) => i.id)

  // Sum paid amounts per invoice (income expenses linked via invoice_id).
  const { data: payments } = await supabase
    .from('expenses')
    .select('invoice_id, amount')
    .in('invoice_id', invoiceIds)
  const paidMap = new Map<string, number>()
  ;(payments || []).forEach((p: any) => {
    paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) || 0) + Number(p.amount || 0))
  })

  // Existing auto reminders per (invoice, stage).
  const { data: existing } = await supabase
    .from('invoice_reminders')
    .select('invoice_id, stage, trigger')
    .in('invoice_id', invoiceIds)
    .eq('trigger', 'auto')
  const sentKey = new Set<string>()
  ;(existing || []).forEach((r: any) => sentKey.add(`${r.invoice_id}:${r.stage}`))

  let sent = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const inv of list as any[]) {
    const total = Number(inv.total_amount || 0)
    const paid = paidMap.get(inv.id) || 0
    if (paid >= total && total > 0) continue
    const remaining = total - paid

    const due = new Date(inv.due_date)
    due.setHours(0, 0, 0, 0)
    const daysOverdue = Math.floor((todayMs - due.getTime()) / 86400000)
    if (daysOverdue < STAGES[0]) continue

    // Pick the highest stage that fits AND hasn't been sent yet.
    let stageToSend: number | null = null
    for (let i = STAGES.length - 1; i >= 0; i--) {
      const s = STAGES[i]
      if (daysOverdue >= s && !sentKey.has(`${inv.id}:${s}`)) {
        stageToSend = s
        break
      }
    }
    if (stageToSend === null) continue

    const idempotencyKey = `invoice-reminder-${inv.id}-auto-${stageToSend}`
    try {
      const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'invoice-payment-reminder',
          recipientEmail: inv.client_email,
          idempotencyKey,
          templateData: {
            clientName: inv.client_name,
            invoiceNumber: inv.invoice_number,
            issueDate: formatDate(inv.issue_date),
            dueDate: formatDate(inv.due_date),
            amount: formatAmount(remaining, inv.currency || 'EUR'),
            daysOverdue: String(daysOverdue),
            customMessage: '',
            pdfUrl: '',
          },
        },
      })
      if (sendErr) throw sendErr

      await supabase.from('invoice_reminders').insert({
        invoice_id: inv.id,
        stage: stageToSend,
        trigger: 'auto',
        recipient_email: inv.client_email,
        message_id: idempotencyKey,
      })
      sent++
    } catch (e: any) {
      console.error('Reminder failed for', inv.id, e?.message || e)
      errors.push({ id: inv.id, error: String(e?.message || e) })
    }
  }

  return new Response(
    JSON.stringify({ processed: list.length, sent, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
