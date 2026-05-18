/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = 'https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/email-assets/logo.png'

interface InvoiceReminderProps {
  clientName?: string
  invoiceNumber?: string
  issueDate?: string
  dueDate?: string
  amount?: string
  daysOverdue?: string
  customMessage?: string
  pdfUrl?: string
}

const InvoiceReminderEmail = ({
  clientName, invoiceNumber, issueDate, dueDate, amount, daysOverdue, customMessage, pdfUrl,
}: InvoiceReminderProps) => (
  <Html lang="hr" dir="ltr">
    <Head />
    <Preview>Podsjetnik za račun {invoiceNumber || ''} – {amount || ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
        <Heading style={h1}>Podsjetnik za naplatu</Heading>
        <Text style={text}>
          Poštovani{clientName ? ` ${clientName}` : ''},
        </Text>
        {customMessage ? (
          <Text style={text}>{customMessage}</Text>
        ) : (
          <Text style={text}>
            Ljubazno Vas podsjećamo na nepodmireno potraživanje.
          </Text>
        )}

        <div style={highlight}>
          <Text style={highlightLabel}>Iznos za platiti</Text>
          <Text style={highlightAmount}>{amount || ''}</Text>
          <Text style={highlightMeta}>
            Račun: <strong>{invoiceNumber || ''}</strong>
            {issueDate ? ` · Izdan: ${issueDate}` : ''}
            {dueDate ? ` · Dospijeće: ${dueDate}` : ''}
          </Text>
          {daysOverdue ? (
            <Text style={overdue}>Kašnjenje: {daysOverdue} dana</Text>
          ) : null}
        </div>

        {pdfUrl ? (
          <Button href={pdfUrl} style={button}>Preuzmi PDF računa</Button>
        ) : null}

        <Text style={text}>
          Ako ste uplatu već izvršili, molimo zanemarite ovu poruku. Hvala na suradnji.
        </Text>

        <Text style={footer}>— {SITE_NAME}</Text>
        <Text style={disclaimer}>
          Ovo je neformalni podsjetnik za internu komunikaciju, a ne službena opomena
          u smislu poreznih ili pravnih propisa.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoiceReminderEmail,
  subject: (data: Record<string, any>) =>
    `Podsjetnik: račun ${data.invoiceNumber || ''}${data.daysOverdue ? ` (${data.daysOverdue} d kašnjenja)` : ''}`,
  displayName: 'Invoice payment reminder',
  previewData: {
    clientName: 'Tvrtka d.o.o.',
    invoiceNumber: 'R-2025-001',
    issueDate: '01.05.2025',
    dueDate: '15.05.2025',
    amount: '1.250,00 €',
    daysOverdue: '12',
    customMessage: 'Ljubazno Vas molimo za uplatu preostalog iznosa.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 16px' }
const highlight = {
  backgroundColor: 'hsl(172, 66%, 97%)',
  border: '1px solid hsl(172, 66%, 90%)',
  borderRadius: '12px',
  padding: '16px 18px',
  margin: '20px 0',
}
const highlightLabel = { fontSize: '11px', color: 'hsl(170, 15%, 45%)', textTransform: 'uppercase' as const, margin: '0 0 4px' }
const highlightAmount = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(172, 66%, 40%)', margin: '0 0 8px' }
const highlightMeta = { fontSize: '12px', color: 'hsl(170, 15%, 35%)', margin: '0 0 4px' }
const overdue = { fontSize: '12px', fontWeight: 'bold' as const, color: 'hsl(0, 70%, 45%)', margin: '4px 0 0' }
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '24px 0 12px', opacity: '0.8' }
const disclaimer = { fontSize: '10px', color: 'hsl(170, 15%, 55%)', fontStyle: 'italic' as const, margin: '12px 0 0', opacity: '0.7' }
