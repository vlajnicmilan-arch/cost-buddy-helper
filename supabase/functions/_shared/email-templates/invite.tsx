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
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { getLogoUrl } from '../brandAssets.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

const LOGO_URL = getLogoUrl()
export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Pozvani ste na Centar</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="Centar" width="48" height="48" style={logo} />
        <Heading style={h1}>Pozvani ste!</Heading>
        <Text style={text}>
          Pozvani ste da se pridružite na{' '}
          <Link href={siteUrl} style={link}>
            <strong>Centar</strong>
          </Link>
          . Kliknite gumb ispod kako biste prihvatili poziv i kreirali svoj račun.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Prihvati poziv
        </Button>
        <Text style={footer}>
          Ako niste očekivali ovaj poziv, slobodno ignorirajte ovaj email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: 'hsl(172, 66%, 40%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '32px 0 0', opacity: '0.7' }
