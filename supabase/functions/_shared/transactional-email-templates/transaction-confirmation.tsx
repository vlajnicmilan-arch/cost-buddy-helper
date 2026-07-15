/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { getLogoUrl } from '../brandAssets.ts'

const SITE_NAME = 'Centar'
const LOGO_URL = getLogoUrl()
interface TransactionConfirmationProps {
  description?: string
  amount?: string
  category?: string
  date?: string
}

const TransactionConfirmationEmail = ({ description, amount, category, date }: TransactionConfirmationProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Transakcija zabilježena: {description || 'Nova transakcija'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Transakcija zabilježena ✓</Heading>
        <Text style={text}>
          Nova transakcija je uspješno dodana u vaš Centar račun:
        </Text>
        <Text style={highlight}>
          {description || 'Transakcija'} — {amount || '0 €'}
        </Text>
        <Text style={detail}>
          📂 Kategorija: {category || 'Ostalo'}<br />
          📅 Datum: {date || 'Danas'}
        </Text>
        <Button style={button} href="https://vmbalance.com/app">
          Pogledaj detalje
        </Button>
        <Text style={footer}>— Tim {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TransactionConfirmationEmail,
  subject: (data: Record<string, any>) => `Transakcija: ${data.description || 'Nova transakcija'}`,
  displayName: 'Transaction confirmation',
  previewData: { description: 'Konzum', amount: '45,99 €', category: 'Hrana', date: '09.04.2026.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 45%)', lineHeight: '1.6', margin: '0 0 24px' }
const highlight = {
  fontSize: '18px', fontWeight: 'bold' as const, color: 'hsl(172, 66%, 40%)',
  backgroundColor: 'hsl(172, 66%, 97%)', padding: '12px 16px', borderRadius: '8px', margin: '0 0 16px',
}
const detail = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.8', margin: '0 0 24px' }
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px',
  borderRadius: '12px', padding: '12px 24px', textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '32px 0 0', opacity: '0.7' }
