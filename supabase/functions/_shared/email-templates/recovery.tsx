/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

const LOGO_URL = 'https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/email-assets/logo.png'

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Resetirajte svoju lozinku za V&M Balance</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="V&M Balance" width="48" height="48" style={logo} />
        <Heading style={h1}>Resetiranje lozinke</Heading>
        <Text style={text}>
          Primili smo zahtjev za resetiranje vaše lozinke za V&M Balance.
          Kliknite gumb ispod kako biste odabrali novu lozinku.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Resetiraj lozinku
        </Button>
        <Text style={footer}>
          Ako niste zatražili resetiranje lozinke, slobodno ignorirajte ovaj email.
          Vaša lozinka neće biti promijenjena.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(175, 30%, 10%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(170, 15%, 45%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '32px 0 0', opacity: '0.7' }
