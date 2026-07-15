/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Centar'

type Lang = 'hr' | 'en' | 'de'

interface StepPayload {
  step_no: number
  actor_name: string
  actor_role: 'owner' | 'investor'
  action: 'propose' | 'counter' | 'correction' | 'accept' | 'reject'
  message: string | null
  price: number | null
  created_at: string
}

interface Props {
  lang?: Lang
  decisionTitle?: string
  projectName?: string
  outcome?: 'approved' | 'rejected' | 'closed'
  closedReason?: string | null
  closedAt?: string | null
  effectivePrice?: number | null
  hasAmendment?: boolean
  attachmentsCount?: number
  steps?: StepPayload[]
}

const STR: Record<Lang, Record<string, string>> = {
  hr: {
    preview: 'Sažetak odluke',
    subject: 'Sažetak odluke',
    hi: 'Pozdrav,',
    intro: 'Odluka u projektu {{project}} je zatvorena. Slijedi sažetak.',
    outcome: 'Ishod',
    approved: 'Odobreno',
    rejected: 'Odbijeno',
    closed: 'Zatvoreno bez dogovora',
    closedAt: 'Zatvoreno',
    finalPrice: 'Konačna cijena',
    noPrice: 'bez financijskog učinka',
    amendment: 'Automatski je stvorena izmjena ugovora (aneks).',
    steps: 'Slijed koraka',
    attachments: 'Prilozi ({{n}}) — dostupni u aplikaciji.',
    action_propose: 'Prijedlog',
    action_counter: 'Protuprijedlog',
    action_correction: 'Korekcija',
    action_accept: 'Prihvaćeno',
    action_reject: 'Odbijeno',
    footer: 'Automatska obavijest — {{site}}. Postavke obavijesti mijenjaš u aplikaciji.',
  },
  en: {
    preview: 'Decision summary',
    subject: 'Decision summary',
    hi: 'Hello,',
    intro: 'The decision in project {{project}} has been closed. Summary below.',
    outcome: 'Outcome',
    approved: 'Approved',
    rejected: 'Rejected',
    closed: 'Closed without agreement',
    closedAt: 'Closed at',
    finalPrice: 'Final price',
    noPrice: 'no financial impact',
    amendment: 'A contract amendment was created automatically.',
    steps: 'Timeline',
    attachments: 'Attachments ({{n}}) — available in the app.',
    action_propose: 'Proposal',
    action_counter: 'Counter‑proposal',
    action_correction: 'Correction',
    action_accept: 'Accepted',
    action_reject: 'Rejected',
    footer: 'Automated notification — {{site}}. Manage your notification settings in the app.',
  },
  de: {
    preview: 'Zusammenfassung der Entscheidung',
    subject: 'Zusammenfassung der Entscheidung',
    hi: 'Hallo,',
    intro: 'Die Entscheidung im Projekt {{project}} wurde geschlossen. Zusammenfassung unten.',
    outcome: 'Ergebnis',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    closed: 'Ohne Einigung geschlossen',
    closedAt: 'Geschlossen am',
    finalPrice: 'Endpreis',
    noPrice: 'keine finanzielle Auswirkung',
    amendment: 'Ein Vertragszusatz wurde automatisch erstellt.',
    steps: 'Verlauf',
    attachments: 'Anhänge ({{n}}) — in der App verfügbar.',
    action_propose: 'Vorschlag',
    action_counter: 'Gegenvorschlag',
    action_correction: 'Korrektur',
    action_accept: 'Angenommen',
    action_reject: 'Abgelehnt',
    footer: 'Automatische Mitteilung — {{site}}. Benachrichtigungseinstellungen in der App verwalten.',
  },
}

const tt = (lang: Lang, key: string, vars?: Record<string, string | number>) => {
  const base = STR[lang]?.[key] ?? STR.hr[key] ?? key
  if (!vars) return base
  return base.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ''))
}

const outcomeLabel = (lang: Lang, outcome?: string) => {
  if (outcome === 'approved') return tt(lang, 'approved')
  if (outcome === 'rejected') return tt(lang, 'rejected')
  return tt(lang, 'closed')
}

const actionLabel = (lang: Lang, a: StepPayload['action']) => tt(lang, `action_${a}`)

const fmtMoney = (n: number) => {
  const sign = n < 0 ? '−' : '+'
  const abs = Math.abs(n).toFixed(2)
  return `${sign}${abs} €`
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  } catch { return iso }
}

const DecisionSummaryEmail = ({
  lang = 'hr',
  decisionTitle = '',
  projectName = '',
  outcome = 'approved',
  closedAt = null,
  effectivePrice = null,
  hasAmendment = false,
  attachmentsCount = 0,
  steps = [],
}: Props) => {
  const L = (STR[lang] ? lang : 'hr') as Lang
  return (
    <Html lang={L} dir="ltr">
      <Head />
      <Preview>{tt(L, 'preview')} — {decisionTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{decisionTitle || tt(L, 'preview')}</Heading>
          <Text style={text}>{tt(L, 'hi')}</Text>
          <Text style={text}>{tt(L, 'intro', { project: projectName })}</Text>

          <Section style={card}>
            <Text style={label}>{tt(L, 'outcome')}</Text>
            <Text style={outcomeText}>{outcomeLabel(L, outcome)}</Text>
            {closedAt && (
              <Text style={smallText}>{tt(L, 'closedAt')}: {fmtDate(closedAt)}</Text>
            )}
            <Text style={label}>{tt(L, 'finalPrice')}</Text>
            <Text style={priceText}>
              {effectivePrice != null ? fmtMoney(effectivePrice) : tt(L, 'noPrice')}
            </Text>
            {hasAmendment && (
              <Text style={smallText}>{tt(L, 'amendment')}</Text>
            )}
          </Section>

          <Heading as="h2" style={h2}>{tt(L, 'steps')}</Heading>
          {steps.map((s) => (
            <Section key={s.step_no} style={stepBox}>
              <Text style={stepHeader}>
                {s.step_no}. {s.actor_name} — {actionLabel(L, s.action)}
                {s.price != null ? ` · ${fmtMoney(Number(s.price))}` : ''}
              </Text>
              <Text style={smallText}>{fmtDate(s.created_at)}</Text>
              {s.message && <Text style={stepMsg}>{s.message}</Text>}
            </Section>
          ))}

          {attachmentsCount > 0 && (
            <Text style={smallText}>{tt(L, 'attachments', { n: attachmentsCount })}</Text>
          )}

          <Hr style={hr} />
          <Text style={footer}>{tt(L, 'footer', { site: SITE_NAME })}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DecisionSummaryEmail,
  subject: (data: Record<string, any>) => {
    const lang = (STR[data?.lang as Lang] ? data.lang : 'hr') as Lang
    const title = data?.decisionTitle ?? ''
    return `${tt(lang, 'subject')}${title ? `: ${title}` : ''}`
  },
  displayName: 'Decision summary',
  previewData: {
    lang: 'hr',
    decisionTitle: 'Dodatni radovi — vodovod',
    projectName: 'Kuća Novakovi',
    outcome: 'approved',
    closedAt: new Date().toISOString(),
    effectivePrice: 1200,
    hasAmendment: true,
    attachmentsCount: 2,
    steps: [
      { step_no: 1, actor_name: 'Marko', actor_role: 'owner', action: 'propose', message: 'Predlažem dodatne radove', price: 1500, created_at: new Date().toISOString() },
      { step_no: 2, actor_name: 'Ana', actor_role: 'investor', action: 'counter', message: 'Može, ali 1000', price: 1000, created_at: new Date().toISOString() },
      { step_no: 3, actor_name: 'Marko', actor_role: 'owner', action: 'correction', message: 'Sredina — 1200', price: 1200, created_at: new Date().toISOString() },
      { step_no: 4, actor_name: 'Ana', actor_role: 'investor', action: 'accept', message: null, price: null, created_at: new Date().toISOString() },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", color: '#0f172a' }
const container = { padding: '24px 24px 32px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '22px', margin: '0 0 12px', color: '#0f172a' }
const h2 = { fontSize: '16px', margin: '20px 0 8px', color: '#0f172a' }
const text = { fontSize: '14px', lineHeight: '22px', margin: '0 0 8px', color: '#0f172a' }
const smallText = { fontSize: '12px', color: '#64748b', margin: '2px 0 8px' }
const card = { padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc', margin: '12px 0' }
const label = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '4px 0 2px' }
const outcomeText = { fontSize: '18px', fontWeight: 600, color: '#0d9488', margin: '0 0 4px' }
const priceText = { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }
const stepBox = { padding: '10px 12px', borderLeft: '3px solid #0d9488', backgroundColor: '#f8fafc', margin: '6px 0', borderRadius: '4px' }
const stepHeader = { fontSize: '13px', fontWeight: 600, margin: '0 0 2px', color: '#0f172a' }
const stepMsg = { fontSize: '13px', margin: '4px 0 0', color: '#334155', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#e2e8f0', margin: '20px 0 12px' }
const footer = { fontSize: '11px', color: '#94a3b8', margin: '0' }
