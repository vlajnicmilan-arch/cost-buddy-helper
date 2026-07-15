import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Centar'

interface CrashAlertProps {
  occurredAt?: string
  source?: string // 'error_boundary' | 'window_error' | 'unhandled_rejection' | 'cron'
  message?: string
  stack?: string
  componentStack?: string
  route?: string
  userId?: string
  userEmail?: string
  appVersion?: string
  platform?: string
  signature?: string
  errorCount?: number
  affectedUsers?: number
  adminUrl?: string
}

const sourceLabel = (s?: string) => {
  switch (s) {
    case 'error_boundary': return 'React Error Boundary'
    case 'window_error': return 'Window error'
    case 'unhandled_rejection': return 'Unhandled promise rejection'
    case 'cron': return 'Cron monitor (5 min window)'
    default: return s || 'Unknown'
  }
}

const truncate = (s: string | undefined, max: number) => {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '\n… [truncated]' : s
}

const CrashAlertEmail = ({
  occurredAt,
  source,
  message,
  stack,
  componentStack,
  route,
  userId,
  userEmail,
  appVersion,
  platform,
  signature,
  errorCount,
  affectedUsers,
  adminUrl,
}: CrashAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`🔴 ${SITE_NAME} crash: ${(message || 'Unknown error').slice(0, 80)}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>🔴 Aplikacija se srušila</Heading>

        <Section style={badgeRow}>
          <Text style={severityBadge}>{sourceLabel(source)}</Text>
        </Section>

        <Section style={messageBox}>
          <Text style={messageText}>{message || '(no message)'}</Text>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Kontekst</Heading>
        <Text style={meta}>Vrijeme: <strong>{occurredAt || new Date().toISOString()}</strong></Text>
        <Text style={meta}>Ruta: <strong>{route || '—'}</strong></Text>
        <Text style={meta}>Korisnik: {userEmail || userId || 'anoniman / nije prijavljen'}</Text>
        <Text style={meta}>App verzija: {appVersion || '—'}</Text>
        <Text style={meta}>Platforma: {platform || '—'}</Text>
        {typeof errorCount === 'number' ? (
          <Text style={meta}>Broj grešaka: <strong>{errorCount}</strong></Text>
        ) : null}
        {typeof affectedUsers === 'number' ? (
          <Text style={meta}>Pogođenih korisnika: <strong>{affectedUsers}</strong></Text>
        ) : null}

        {stack ? (
          <>
            <Heading as="h2" style={h2}>Stack trace</Heading>
            <Section style={codeBox}>
              <Text style={codeText}>{truncate(stack, 1500)}</Text>
            </Section>
          </>
        ) : null}

        {componentStack ? (
          <>
            <Heading as="h2" style={h2}>Component stack</Heading>
            <Section style={codeBox}>
              <Text style={codeText}>{truncate(componentStack, 800)}</Text>
            </Section>
          </>
        ) : null}

        {adminUrl ? (
          <>
            <Hr style={hr} />
            <Text style={text}>
              <Link href={adminUrl} style={link}>Otvori Pulse dashboard →</Link>
            </Text>
          </>
        ) : null}

        {signature ? (
          <Text style={footer}>Signature: {signature}</Text>
        ) : null}
        <Text style={footer}>{SITE_NAME} · automatski crash alert</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CrashAlertEmail,
  subject: (data: Record<string, any>) =>
    `🔴 ${SITE_NAME} crash: ${(data?.message || 'Unknown error').slice(0, 80)}`,
  displayName: 'Crash alert (admin)',
  previewData: {
    occurredAt: new Date().toISOString(),
    source: 'error_boundary',
    message: "TypeError: Cannot read properties of undefined (reading 'amount')",
    stack: 'TypeError: Cannot read properties of undefined (reading \'amount\')\n    at Dashboard (Dashboard.tsx:128:14)\n    at renderWithHooks (react-dom.js:14803)',
    componentStack: '\n    in Dashboard\n    in Suspense\n    in Routes',
    route: '/app',
    userId: 'd4d31ee6-5f6b-4059-8c87-b595b394f56b',
    userEmail: 'user@example.com',
    appVersion: '1.4.2',
    platform: 'android',
    signature: 'react_error_boundary|/app|typeerror',
    errorCount: 1,
    adminUrl: 'https://vmbalance.com/admin?tab=pulse',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 16px' }
const h2 = { fontSize: '13px', fontWeight: 'bold', color: '#0d3d3a', margin: '20px 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const text = { fontSize: '14px', color: '#22272a', lineHeight: '1.5', margin: '0 0 12px' }
const meta = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
const messageBox = { backgroundColor: '#fef2f2', borderLeft: '3px solid #dc2626', borderRadius: '4px', padding: '12px 14px', margin: '12px 0 0' }
const messageText = { fontSize: '14px', color: '#22272a', lineHeight: '1.55', margin: 0, whiteSpace: 'pre-wrap' as const, fontWeight: 600 }
const codeBox = { backgroundColor: '#f4f8f7', borderRadius: '4px', padding: '10px 12px', margin: '6px 0 0', border: '1px solid #e3e8e7' }
const codeText = { fontSize: '11px', color: '#22272a', lineHeight: '1.45', margin: 0, whiteSpace: 'pre-wrap' as const, fontFamily: 'Menlo, Consolas, monospace' }
const badgeRow = { margin: '0 0 4px' }
const severityBadge = { display: 'inline-block' as const, fontSize: '12px', fontWeight: 600, color: '#7f1d1d', backgroundColor: '#fee2e2', borderRadius: '999px', padding: '4px 10px', margin: 0 }
const hr = { borderColor: '#e3e8e7', margin: '20px 0' }
const link = { color: '#22a39c', textDecoration: 'none', fontWeight: 600 }
const footer = { fontSize: '11px', color: '#999999', margin: '24px 0 0' }
