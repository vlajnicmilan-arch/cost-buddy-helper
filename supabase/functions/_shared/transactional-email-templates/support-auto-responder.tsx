/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = 'https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/email-assets/logo.png'
const SUPPORT_EMAIL = 'support@vmbalance.com'

interface Props {
  name?: string
  subject?: string
  message?: string
  ticketId?: string
  language?: 'hr' | 'en' | 'de'
}

const t = (lang: string) => {
  const dict: Record<string, Record<string, string>> = {
    hr: {
      preview: 'Zaprimili smo vaš upit — odgovaramo unutar 24 sata',
      heading: 'Hvala što ste nas kontaktirali!',
      intro: (n: string) => `Bok${n ? ` ${n}` : ''},`,
      body: 'Vaš upit je uspješno zaprimljen. Naš tim će vam odgovoriti unutar 24 sata, najčešće i puno brže.',
      summaryTitle: 'Sažetak vašeg upita:',
      ticket: 'Broj tiketa',
      subjectLabel: 'Tema',
      messageLabel: 'Poruka',
      tipTitle: '💡 Dok čekate odgovor',
      tipBody: 'Možda već imamo odgovor na vaše pitanje. Pogledajte našu bazu znanja i česta pitanja u aplikaciji.',
      cta: 'Otvori upute i FAQ',
      contactTitle: 'Trebate li pisati izravno?',
      contactBody: (e: string) => `Pišite nam direktno na ${e} i navedite broj tiketa za bržu obradu.`,
      footer: 'Ovo je automatski odgovor — ne odgovarajte na ovaj email.',
      team: (s: string) => `— Tim ${s}`,
    },
    en: {
      preview: 'We received your request — we will reply within 24 hours',
      heading: 'Thanks for reaching out!',
      intro: (n: string) => `Hi${n ? ` ${n}` : ''},`,
      body: 'We received your request. Our team will get back to you within 24 hours, usually much sooner.',
      summaryTitle: 'Your request summary:',
      ticket: 'Ticket ID',
      subjectLabel: 'Subject',
      messageLabel: 'Message',
      tipTitle: '💡 While you wait',
      tipBody: 'We might already have an answer for you — check our in-app help and FAQ.',
      cta: 'Open Help & FAQ',
      contactTitle: 'Need to email us directly?',
      contactBody: (e: string) => `Write to ${e} and include the ticket ID for faster handling.`,
      footer: 'This is an automated reply — please do not reply to this email.',
      team: (s: string) => `— The ${s} Team`,
    },
    de: {
      preview: 'Wir haben Ihre Anfrage erhalten — Antwort innerhalb von 24 Stunden',
      heading: 'Danke für Ihre Nachricht!',
      intro: (n: string) => `Hallo${n ? ` ${n}` : ''},`,
      body: 'Wir haben Ihre Anfrage erhalten. Unser Team meldet sich innerhalb von 24 Stunden, oft deutlich schneller.',
      summaryTitle: 'Zusammenfassung Ihrer Anfrage:',
      ticket: 'Ticket-ID',
      subjectLabel: 'Betreff',
      messageLabel: 'Nachricht',
      tipTitle: '💡 Während Sie warten',
      tipBody: 'Vielleicht finden Sie die Antwort bereits in unserer In-App-Hilfe und den FAQ.',
      cta: 'Hilfe & FAQ öffnen',
      contactTitle: 'Müssen Sie direkt schreiben?',
      contactBody: (e: string) => `Schreiben Sie an ${e} und geben Sie die Ticket-ID für eine schnellere Bearbeitung an.`,
      footer: 'Dies ist eine automatische Antwort — bitte nicht auf diese E-Mail antworten.',
      team: (s: string) => `— Das ${s} Team`,
    },
  }
  return dict[lang] || dict.hr
}

const SupportAutoResponderEmail = ({ name, subject, message, ticketId, language = 'hr' }: Props) => {
  const L = t(language)
  return (
    <Html lang={language} dir="ltr">
      <Head />
      <Preview>{L.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
          <Heading style={h1}>{L.heading}</Heading>
          <Text style={text}>{L.intro(name || '')}</Text>
          <Text style={text}>{L.body}</Text>

          <Section style={summaryBox}>
            <Text style={summaryTitle}>{L.summaryTitle}</Text>
            {ticketId && (
              <Text style={summaryRow}>
                <strong>{L.ticket}:</strong> <code style={code}>{ticketId.slice(0, 8)}</code>
              </Text>
            )}
            {subject && (
              <Text style={summaryRow}>
                <strong>{L.subjectLabel}:</strong> {subject}
              </Text>
            )}
            {message && (
              <Text style={summaryMessage}>
                <strong>{L.messageLabel}:</strong><br />
                {message.length > 400 ? message.slice(0, 400) + '…' : message}
              </Text>
            )}
          </Section>

          <Section style={tipBox}>
            <Text style={tipTitle}>{L.tipTitle}</Text>
            <Text style={tipText}>{L.tipBody}</Text>
            <Button style={button} href="https://vmbalance.com/app?openHelp=1">
              {L.cta}
            </Button>
          </Section>

          <Text style={contactTitle}>{L.contactTitle}</Text>
          <Text style={text}>{L.contactBody(SUPPORT_EMAIL)}</Text>

          <Text style={footer}>
            {L.footer}<br />
            {L.team(SITE_NAME)}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SupportAutoResponderEmail,
  subject: (data: Record<string, any>) => {
    const lang = data?.language || 'hr'
    if (lang === 'en') return `Re: ${data?.subject || 'Your request'} — we'll reply within 24h`
    if (lang === 'de') return `Re: ${data?.subject || 'Ihre Anfrage'} — Antwort innerhalb von 24h`
    return `Re: ${data?.subject || 'Vaš upit'} — odgovaramo unutar 24h`
  },
  displayName: 'Support auto-responder',
  previewData: {
    name: 'Marko',
    subject: 'Pitanje o budžetima',
    message: 'Kako mogu kreirati budžet koji se dijeli s drugim korisnicima?',
    ticketId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    language: 'hr',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 14px' }
const summaryBox = {
  backgroundColor: 'hsl(172, 30%, 97%)',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '20px 0',
  borderLeft: '3px solid hsl(172, 66%, 40%)',
}
const summaryTitle = { fontSize: '13px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 20%)', margin: '0 0 10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const summaryRow = { fontSize: '13px', color: 'hsl(170, 15%, 30%)', margin: '0 0 6px', lineHeight: '1.5' }
const summaryMessage = { fontSize: '13px', color: 'hsl(170, 15%, 30%)', margin: '10px 0 0', lineHeight: '1.5', whiteSpace: 'pre-wrap' as const }
const code = { backgroundColor: 'hsl(172, 30%, 92%)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }
const tipBox = {
  backgroundColor: 'hsl(45, 90%, 96%)',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '24px 0',
}
const tipTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(35, 50%, 25%)', margin: '0 0 6px' }
const tipText = { fontSize: '13px', color: 'hsl(35, 30%, 35%)', margin: '0 0 12px', lineHeight: '1.5' }
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px',
  borderRadius: '10px', padding: '10px 20px', textDecoration: 'none', display: 'inline-block',
}
const contactTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 15%)', margin: '24px 0 8px' }
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 50%)', margin: '32px 0 0', opacity: '0.85', lineHeight: '1.6', borderTop: '1px solid hsl(170, 15%, 90%)', paddingTop: '16px' }
