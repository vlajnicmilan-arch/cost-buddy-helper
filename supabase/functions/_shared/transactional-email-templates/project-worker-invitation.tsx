/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'V&M Balance'
const LOGO_URL = 'https://fzalxjretvtvokiotvkf.supabase.co/storage/v1/object/public/email-assets/logo.png'

interface ProjectWorkerInvitationProps {
  inviterName?: string
  projectName?: string
  workerName?: string
  inviteUrl?: string
  isNewUser?: boolean
}

const ProjectWorkerInvitationEmail = ({
  inviterName,
  projectName,
  workerName,
  inviteUrl,
  isNewUser,
}: ProjectWorkerInvitationProps) => {
  const inviter = inviterName || 'Voditelj projekta'
  const project = projectName || 'projekt'
  const greeting = workerName ? `Pozdrav, ${workerName}!` : 'Pozdrav!'
  const cta = isNewUser ? 'Kreiraj račun i pridruži se' : 'Prihvati poziv'
  const url = inviteUrl || 'https://vmbalance.com/app'

  return (
    <Html lang="hr" dir="ltr">
      <Head />
      <Preview>{`${inviter} vas poziva na projekt ${project}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="48" height="48" style={logo} />
          <Heading style={h1}>{greeting}</Heading>
          <Text style={text}>
            <strong>{inviter}</strong> vas poziva da se pridružite projektu{' '}
            <strong>{project}</strong> u aplikaciji {SITE_NAME}.
          </Text>
          <Text style={text}>
            {isNewUser
              ? 'Nakon registracije moći ćete voditi svoj dnevnik rada i unositi radne sate za ovaj projekt — besplatno, bez plaćene verzije.'
              : 'Prihvatom poziva dobivate pristup unosu dnevnika rada i radnih sati za ovaj projekt.'}
          </Text>
          <Button style={button} href={url}>
            {cta}
          </Button>
          <Text style={smallText}>
            Ili otvorite ovu poveznicu u pregledniku:{' '}
            <Link href={url} style={link}>{url}</Link>
          </Text>
          <Text style={footer}>
            Poveznica vrijedi 7 dana. Ako ne očekujete ovaj poziv, slobodno ignorirajte poruku.
          </Text>
          <Text style={footer}>— Tim {SITE_NAME}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ProjectWorkerInvitationEmail,
  subject: (data: Record<string, any>) =>
    `${data.inviterName || 'Voditelj'} vas poziva na projekt ${data.projectName || ''}`.trim(),
  displayName: 'Project worker invitation',
  previewData: {
    inviterName: 'Marko Marić',
    projectName: 'Kuća Novakovi',
    workerName: 'Ivan',
    inviteUrl: 'https://vmbalance.com/join-project/abc-123',
    isNewUser: false,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const logo = { marginBottom: '24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(175, 30%, 10%)', margin: '0 0 20px' }
const text = { fontSize: '14px', color: 'hsl(170, 15%, 35%)', lineHeight: '1.6', margin: '0 0 20px' }
const smallText = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', lineHeight: '1.5', margin: '20px 0 0', wordBreak: 'break-all' as const }
const link = { color: 'hsl(172, 66%, 40%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(172, 66%, 40%)', color: '#ffffff', fontSize: '14px', fontWeight: 'bold' as const,
  borderRadius: '12px', padding: '12px 24px', textDecoration: 'none', display: 'inline-block',
}
const footer = { fontSize: '12px', color: 'hsl(170, 15%, 45%)', margin: '20px 0 0', opacity: '0.8' }
