/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { getLogoUrl } from '../brandAssets.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = getLogoUrl()
interface BudgetAlertProps {
  budgetName?: string
  spentPercent?: string
  spentAmount?: string
  totalAmount?: string
}

const BudgetAlertEmail = ({ budgetName, spentPercent, spentAmount, totalAmount }: BudgetAlertProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>⚠️ Budžet "{budgetName || 'Nepoznat'}" se približava limitu</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Upozorenje o budžetu ⚠️</Heading>
        <Text style={text}>
          Vaš budžet <strong>{budgetName || 'Nepoznat'}</strong> dosegnuo je{' '}
          <strong>{spentPercent || '80'}%</strong> limita.
        </Text>
        <Text style={highlight}>
          Potrošeno: {spentAmount || '0'} / {totalAmount || '0'}
        </Text>
        <Text style={text}>
          Preporučujemo pregled troškova i prilagodbu plana kako biste ostali unutar budžeta.
        </Text>
        <Button style={button} href="https://vmbalance.com/app">
          Otvori V&M Balance
        </Button>
        <Text style={footer}>— Tim {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BudgetAlertEmail,
  subject: (data: Record<string, any>) => `⚠️ Budžet "${data.budgetName || 'Nepoznat'}" – ${data.spentPercent || '80'}% potrošeno`,
  displayName: 'Budget alert',
  previewData: { budgetName: 'Mjesečni troškovi', spentPercent: '85', spentAmount: '850 €', totalAmount: '1.000 €' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 45%)', lineHeight: '1.6', margin: '0 0 24px' }
const highlight = {
  fontSize: '18px', fontWeight: 'bold' as const, color: 'hsl(172, 66%, 40%)',
  backgroundColor: 'hsl(172, 66%, 97%)', padding: '12px 16px', borderRadius: '8px', margin: '0 0 24px',
}
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px',
  borderRadius: '12px', padding: '12px 24px', textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '32px 0 0', opacity: '0.7' }
