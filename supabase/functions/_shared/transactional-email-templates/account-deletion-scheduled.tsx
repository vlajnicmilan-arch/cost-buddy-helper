/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { getLogoUrl } from '../brandAssets.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = getLogoUrl()
interface Props {
  scheduledDate?: string
  graceDays?: number
}

const AccountDeletionScheduledEmail = ({ scheduledDate, graceDays = 30 }: Props) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Zaprimili smo zahtjev za brisanje vašeg V&M Balance računa</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Zahtjev za brisanje računa zaprimljen</Heading>
        <Text style={text}>
          Zaprimili smo vaš zahtjev za trajno brisanje V&M Balance računa i svih povezanih podataka.
        </Text>
        <Text style={highlight}>
          🗓️ Račun će biti trajno obrisan: <strong>{scheduledDate || 'kroz 30 dana'}</strong>
        </Text>
        <Text style={text}>
          Imate {graceDays} dana da se predomislite. <strong>Ako se prijavite u svoj račun prije tog datuma,
          brisanje će biti automatski otkazano</strong> i svi vaši podaci ostaju netaknuti.
        </Text>
        <Text style={text}>
          Nakon isteka roka, brišu se trajno: sve transakcije, projekti, proračuni, računi, dokumenti i postavke.
          Ova radnja je nepovratna.
        </Text>
        <Button style={button} href="https://vmbalance.com/auth">
          Otkaži brisanje (prijavi se)
        </Button>
        <Text style={footer}>
          Ako niste vi tražili brisanje, odmah se prijavite i promijenite lozinku.<br />
          — Tim {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountDeletionScheduledEmail,
  subject: 'Zahtjev za brisanje računa zaprimljen',
  displayName: 'Account deletion scheduled',
  previewData: { scheduledDate: '15.05.2026.', graceDays: 30 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 18px' }
const highlight = {
  fontSize: '15px', color: 'hsl(0, 70%, 35%)',
  backgroundColor: 'hsl(0, 70%, 97%)', padding: '14px 16px', borderRadius: '8px', margin: '0 0 20px',
  borderLeft: '3px solid hsl(0, 70%, 50%)',
}
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px',
  borderRadius: '12px', padding: '12px 24px', textDecoration: 'none', display: 'inline-block',
  margin: '8px 0 24px',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '24px 0 0', opacity: '0.8', lineHeight: '1.6' }
