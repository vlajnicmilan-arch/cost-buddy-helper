/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
import { getLogoUrl } from '../brandAssets.ts'
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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

const LOGO_URL = getLogoUrl()
export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Potvrdite promjenu email adrese za V&M Balance</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="V&M Balance" width="48" height="48" style={logo} />
        <Heading style={h1}>Promjena email adrese</Heading>
        <Text style={text}>
          Zatražili ste promjenu email adrese za V&M Balance sa{' '}
          <Link href={`mailto:${email}`} style={link}>
            {email}
          </Link>{' '}
          na{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>
          Kliknite gumb ispod kako biste potvrdili ovu promjenu:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Potvrdi promjenu
        </Button>
        <Text style={footer}>
          Ako niste zatražili ovu promjenu, odmah osigurajte svoj račun.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
