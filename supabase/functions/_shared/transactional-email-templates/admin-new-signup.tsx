import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Centar'

interface AdminNewSignupProps {
  userName?: string
  userEmail?: string
  source?: string
  occurredAt?: string
  adminUrl?: string
}

const AdminNewSignupEmail = ({ userName, userEmail, source, occurredAt, adminUrl }: AdminNewSignupProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>{`Nova registracija — ${source || 'izravno'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nova registracija</Heading>

        <Section style={box}>
          <Text style={row}><strong>Korisnik:</strong> {userName || 'bez imena'}</Text>
          <Text style={row}><strong>E-mail:</strong> {userEmail || '—'}</Text>
          <Text style={row}><strong>Izvor:</strong> {source || 'izravno'}</Text>
          <Text style={row}><strong>Vrijeme:</strong> {occurredAt || '—'}</Text>
        </Section>

        {adminUrl ? (
          <Section style={{ textAlign: 'center' as const, marginTop: '20px' }}>
            <Link href={adminUrl} style={button}>Otvori Admin</Link>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME} — transakcijska obavijest administratoru.</Text>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#f6f9f9', fontFamily: 'Inter, -apple-system, Segoe UI, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '24px', maxWidth: '560px', borderRadius: '12px' }
const h1 = { color: '#0f172a', fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }
const box = { backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '16px' }
const row = { color: '#0f172a', fontSize: '14px', margin: '0 0 6px' }
const button = { backgroundColor: '#22a39c', color: '#ffffff', borderRadius: '8px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 12px' }
const footer = { color: '#64748b', fontSize: '12px', margin: 0 }

export const template: TemplateEntry = {
  component: AdminNewSignupEmail,
  subject: (data: Record<string, any>) => `Nova registracija — ${data?.source || 'izravno'}`,
  displayName: 'Admin — nova registracija',
  previewData: {
    userName: 'Marko M.',
    userEmail: 'marko@example.com',
    source: 'Facebook, plaćeni oglas',
    occurredAt: new Date().toISOString(),
    adminUrl: 'https://vmbalance.com/admin',
  },
}

export default AdminNewSignupEmail
