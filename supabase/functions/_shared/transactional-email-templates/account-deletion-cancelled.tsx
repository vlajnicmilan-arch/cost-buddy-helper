/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { getLogoUrl } from '../brandAssets.ts'

const SITE_NAME = 'Centar'
const LOGO_URL = getLogoUrl()
const AccountDeletionCancelledEmail = () => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Brisanje vašeg računa je otkazano — dobrodošli natrag!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Dobrodošli natrag! 👋</Heading>
        <Text style={text}>
          Brisanje vašeg Centar računa je <strong>uspješno otkazano</strong>.
        </Text>
        <Text style={highlight}>
          ✅ Svi vaši podaci, transakcije, projekti i postavke ostaju netaknuti.
        </Text>
        <Text style={text}>
          Možete nastaviti koristiti aplikaciju kao i prije. Drago nam je što ste se predomislili.
        </Text>
        <Button style={button} href="https://vmbalance.com/app">
          Otvori aplikaciju
        </Button>
        <Text style={footer}>
          Ako niste vi otkazali brisanje, odmah promijenite lozinku.<br />
          — Tim {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountDeletionCancelledEmail,
  subject: 'Brisanje računa je otkazano',
  displayName: 'Account deletion cancelled',
  previewData: {},
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 18px' }
const highlight = {
  fontSize: '15px', color: 'hsl(172, 66%, 25%)',
  backgroundColor: 'hsl(172, 66%, 97%)', padding: '14px 16px', borderRadius: '8px', margin: '0 0 20px',
  borderLeft: '3px solid hsl(172, 66%, 40%)',
}
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px',
  borderRadius: '12px', padding: '12px 24px', textDecoration: 'none', display: 'inline-block',
  margin: '8px 0 24px',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '24px 0 0', opacity: '0.8', lineHeight: '1.6' }
