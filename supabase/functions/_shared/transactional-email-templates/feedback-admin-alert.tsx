import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Centar"

interface FeedbackAdminAlertProps {
  type?: string
  message?: string
  rating?: number | null
  route?: string
  appVersion?: string
  viewport?: string
  platform?: string
  userEmail?: string
  userName?: string
  consoleTailCount?: number
  feedbackId?: string
  adminUrl?: string
}

const labelForType = (t?: string) => {
  switch (t) {
    case 'bug': return '🐛 Bug'
    case 'idea': return '💡 Idea'
    case 'question': return '❓ Question'
    default: return t || 'Feedback'
  }
}

const FeedbackAdminAlertEmail = ({
  type,
  message,
  rating,
  route,
  appVersion,
  viewport,
  platform,
  userEmail,
  userName,
  consoleTailCount,
  feedbackId,
  adminUrl,
}: FeedbackAdminAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${labelForType(type)} – ${(message || '').slice(0, 80)}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New in-app feedback</Heading>

        <Section style={badgeRow}>
          <Text style={typeBadge}>{labelForType(type)}</Text>
          {rating ? <Text style={ratingBadge}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</Text> : null}
        </Section>

        <Section style={messageBox}>
          <Text style={messageText}>{message || '(empty)'}</Text>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Submitter</Heading>
        <Text style={meta}>
          {userName || 'Anonymous'}{userEmail ? ` · ${userEmail}` : ''}
        </Text>

        <Heading as="h2" style={h2}>Diagnostics</Heading>
        <Text style={meta}>Route: <strong>{route || '—'}</strong></Text>
        <Text style={meta}>App version: {appVersion || '—'}</Text>
        <Text style={meta}>Viewport: {viewport || '—'}</Text>
        <Text style={meta}>Platform: {platform || '—'}</Text>
        {consoleTailCount ? (
          <Text style={meta}>Attached console logs: {consoleTailCount} entries</Text>
        ) : null}

        {adminUrl ? (
          <>
            <Hr style={hr} />
            <Text style={text}>
              <Link href={adminUrl} style={link}>Open in admin dashboard →</Link>
            </Text>
          </>
        ) : null}

        {feedbackId ? (
          <Text style={footer}>Feedback ID: {feedbackId}</Text>
        ) : null}
        <Text style={footer}>{SITE_NAME} · automated alert</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FeedbackAdminAlertEmail,
  subject: (data: Record<string, any>) =>
    `[${labelForType(data?.type)}] ${(data?.message || '').slice(0, 60) || 'New feedback'}`,
  displayName: 'Feedback admin alert',
  previewData: {
    type: 'idea',
    message: 'Add dark mode toggle on the dashboard',
    rating: 5,
    route: '/home',
    appVersion: 'web',
    viewport: '384x832@2.81',
    platform: 'iPhone',
    userEmail: 'jane@example.com',
    userName: 'Jane',
    consoleTailCount: 8,
    feedbackId: 'd0fbccc1-e2da-499f-8d6d-560b7d6f97f9',
    adminUrl: 'https://vmbalance.com/admin',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0d3d3a', margin: '0 0 16px' }
const h2 = { fontSize: '14px', fontWeight: 'bold', color: '#0d3d3a', margin: '20px 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const text = { fontSize: '14px', color: '#22272a', lineHeight: '1.5', margin: '0 0 12px' }
const meta = { fontSize: '13px', color: '#55575d', lineHeight: '1.5', margin: '0 0 4px' }
const messageBox = { backgroundColor: '#f4f8f7', borderLeft: '3px solid #22a39c', borderRadius: '4px', padding: '12px 14px', margin: '12px 0 0' }
const messageText = { fontSize: '14px', color: '#22272a', lineHeight: '1.55', margin: 0, whiteSpace: 'pre-wrap' as const }
const badgeRow = { margin: '0 0 4px' }
const typeBadge = { display: 'inline-block' as const, fontSize: '13px', fontWeight: 600, color: '#0d3d3a', backgroundColor: '#d8efed', borderRadius: '999px', padding: '4px 10px', margin: '0 8px 0 0' }
const ratingBadge = { display: 'inline-block' as const, fontSize: '13px', color: '#b58a00', margin: 0 }
const hr = { borderColor: '#e3e8e7', margin: '20px 0' }
const link = { color: '#22a39c', textDecoration: 'none', fontWeight: 600 }
const footer = { fontSize: '11px', color: '#999999', margin: '24px 0 0' }
