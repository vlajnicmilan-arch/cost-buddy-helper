/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = 'https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/email-assets/logo.png'

const AccountDeletionCompletedEmail = () => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Vaš V&M Balance račun je trajno obrisan</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Račun je trajno obrisan</Heading>
        <Text style={text}>
          Potvrđujemo da je vaš V&M Balance račun i svi povezani podaci <strong>trajno obrisani</strong>
          u skladu s vašim zahtjevom i pravom na zaborav (GDPR čl. 17).
        </Text>
        <Text style={highlight}>
          🗑️ Obrisano: transakcije, projekti, proračuni, računi, dokumenti, postavke, povijest prijava.
        </Text>
        <Text style={text}>
          Ako ste imali aktivnu pretplatu, automatski je otkazana. Hvala vam što ste koristili V&M Balance.
        </Text>
        <Text style={text}>
          Uvijek ste dobrodošli natrag — možete kreirati novi račun u bilo kojem trenutku.
        </Text>
        <Text style={footer}>
          Za pitanja o GDPR-u: <a href="mailto:privacy@vmbalance.com" style={link}>privacy@vmbalance.com</a><br />
          — Tim {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountDeletionCompletedEmail,
  subject: 'Vaš račun je trajno obrisan',
  displayName: 'Account deletion completed',
  previewData: {},
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 18px' }
const highlight = {
  fontSize: '14px', color: 'hsl(170, 15%, 25%)',
  backgroundColor: 'hsl(170, 15%, 96%)', padding: '14px 16px', borderRadius: '8px', margin: '0 0 20px',
  borderLeft: '3px solid hsl(170, 15%, 60%)',
}
const link = { color: 'hsl(172, 66%, 40%)', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '24px 0 0', opacity: '0.8', lineHeight: '1.6' }
