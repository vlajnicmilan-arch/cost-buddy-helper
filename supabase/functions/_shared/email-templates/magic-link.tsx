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
import { getLogoUrl } from '../brandAssets.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

const LOGO_URL = getLogoUrl()
export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Vaš link za prijavu na V&M Balance</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="V&M Balance" width="48" height="48" style={logo} />
        <Heading style={h1}>Link za prijavu</Heading>
        <Text style={text}>
          Kliknite gumb ispod za prijavu na V&M Balance. Ovaj link uskoro istječe.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Prijavi se
        </Button>
        <Text style={footer}>
          Ako niste zatražili ovaj link, slobodno ignorirajte ovaj email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
