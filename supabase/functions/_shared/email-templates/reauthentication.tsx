/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { getLogoUrl } from '../brandAssets.ts'

interface ReauthenticationEmailProps {
  token: string
}

const LOGO_URL = getLogoUrl()
export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Vaš verifikacijski kod za V&M Balance</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="V&M Balance" width="48" height="48" style={logo} />
        <Heading style={h1}>Verifikacijski kod</Heading>
        <Text style={text}>Koristite kod ispod za potvrdu vašeg identiteta:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Ovaj kod uskoro istječe. Ako ga niste zatražili, slobodno ignorirajte ovaj email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(172, 66%, 40%)',
  margin: '0 0 32px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '32px 0 0', opacity: '0.7' }
