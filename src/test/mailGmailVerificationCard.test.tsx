import { describe, it, expect } from 'vitest';
import {
  detectGmailVerification,
  isGoogleConfirmUrl,
  trimUrlBoundary,
} from '../../supabase/functions/_shared/mailImport/gmailVerification.ts';
import { extractAuthSignals } from '../../supabase/functions/_shared/mailImport/mailHeaders.ts';
import { isAuthenticatedGoogle } from '../../supabase/functions/_shared/mailImport/trustLevel.ts';

const GOOGLE_LINK = 'https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc';

describe('Gmail potvrda prosljeđivanja — prepoznavanje po jezicima', () => {
  it('hrvatski predmet (živi slučaj) se prepoznaje', () => {
    const res = detectGmailVerification({
      fromHeader: 'Tim za Gmail <forwarding-noreply@google.com>',
      subject:
        '(#123456789) Gmail Potvrda o prosljeđivanju – primanje e-pošte s adrese ime@gmail.com',
      bodyText: `Potvrdite: ${GOOGLE_LINK}`,
      links: [],
      googleAuthenticated: true,
    });
    expect(res.isVerification).toBe(true);
    expect(res.code).toBe('123456789');
    expect(res.safeConfirmUrl).toBe(GOOGLE_LINK);
    expect(res.forwardedAddress).toBe('ime@gmail.com');
  });

  it('njemački predmet se prepoznaje', () => {
    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: '(#987654321) Gmail-Weiterleitungsbestätigung',
      bodyText: '',
      links: [GOOGLE_LINK],
      googleAuthenticated: true,
    });
    expect(res.isVerification).toBe(true);
    expect(res.safeConfirmUrl).toBe(GOOGLE_LINK);
  });

  it('mail.google.com vf-link je dopušten', () => {
    expect(isGoogleConfirmUrl('https://mail.google.com/mail/vf-abc')).toBe(true);
    expect(isGoogleConfirmUrl('http://mail.google.com/mail/vf-abc')).toBe(false);
  });
});

describe('Gmail potvrda — sigurnosne ograde', () => {
  it('skida rečenične zagrade i točku, ali čuva enkodirane zagrade u tokenu', () => {
    const wrapped = `(${GOOGLE_LINK}. )`;
    expect(trimUrlBoundary(wrapped)).toBe(GOOGLE_LINK);

    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: 'Gmail Potvrda o prosljeđivanju',
      bodyText: `Potvrdite ovdje: (${GOOGLE_LINK}).`,
      links: [],
      googleAuthenticated: true,
    });
    expect(res.safeConfirmUrl).toBe(GOOGLE_LINK);
  });

  it('skida interpunkciju s oba ruba kandidata iz links', () => {
    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: 'Gmail Forwarding Confirmation',
      bodyText: '',
      links: [`[${GOOGLE_LINK}.]`],
      googleAuthenticated: true,
    });
    expect(res.safeConfirmUrl).toBe(GOOGLE_LINK);
  });

  it('lažni pošiljatelj sličnog imena NE prolazi', () => {
    for (const from of [
      'forwarding-noreply@google.com.zlo.example',
      'forwarding-noreply@g00gle.com',
      '"forwarding-noreply@google.com" <napad@zlo.example>',
    ]) {
      const res = detectGmailVerification({
        fromHeader: from,
        subject: '(#123456789) Gmail Forwarding Confirmation',
        bodyText: GOOGLE_LINK,
        links: [GOOGLE_LINK],
        googleAuthenticated: true,
      });
      expect(res.isVerification).toBe(false);
      expect(res.safeConfirmUrl).toBeNull();
    }
  });

  it('link na ne-Google domenu → kartica bez linka, uz upozorenje', () => {
    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: '(#123456789) Gmail Forwarding Confirmation',
      bodyText: '',
      links: ['https://mail-settings.google.com.zlo.example/mail/vf-abc'],
      googleAuthenticated: true,
    });
    expect(res.isVerification).toBe(true);
    expect(res.safeConfirmUrl).toBeNull();
    expect(res.linkWithheld).toBe(true);
    expect(res.warnings).toContain('verifikacija_link_nije_googleov');
  });

  it('bez linka i bez koda — poruka nije potvrda', () => {
    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: 'Obavijest',
      bodyText: 'Nema ničega.',
      links: [],
      googleAuthenticated: true,
    });
    expect(res.isVerification).toBe(false);
  });

  it('neautenticirana poruka daje kod, ali NIKAD gumb', () => {
    const res = detectGmailVerification({
      fromHeader: 'forwarding-noreply@google.com',
      subject: '(#123456789) Gmail Forwarding Confirmation',
      bodyText: '',
      links: [GOOGLE_LINK],
      googleAuthenticated: false,
    });
    expect(res.safeConfirmUrl).toBeNull();
    expect(res.warnings).toContain('verifikacija_nije_autenticirana');
  });
});

describe('Signali autentičnosti iz sirovih zaglavlja', () => {
  const raw = {
    'message-headers': JSON.stringify([
      ['From', 'Tim za Gmail <forwarding-noreply@google.com>'],
      [
        'Authentication-Results',
        'mx.mailgun.org; dkim=pass header.d=google.com; spf=pass (mailgun.org: domain of forwarding-noreply@google.com) smtp.mailfrom=google.com; dmarc=pass',
      ],
    ]),
  };

  it('Authentication-Results daje dkim/spf kad Mailgunova polja nedostaju', () => {
    const signals = extractAuthSignals(raw);
    expect(signals.dkim).toMatch(/pass/);
    expect(signals.spf).toMatch(/pass/);
    expect(
      isAuthenticatedGoogle({
        ...signals,
        fromHeader: 'Tim za Gmail <forwarding-noreply@google.com>',
      }),
    ).toBe(true);
  });

  it('bez ijednog signala Google gate ostaje zatvoren', () => {
    const signals = extractAuthSignals({});
    expect(
      isAuthenticatedGoogle({ ...signals, fromHeader: 'forwarding-noreply@google.com' }),
    ).toBe(false);
  });

  it('tuđi dkim ne otvara Google gate', () => {
    const signals = extractAuthSignals({
      'message-headers': JSON.stringify([
        ['Authentication-Results', 'mx.mailgun.org; dkim=pass header.d=zlo.example'],
      ]),
    });
    expect(
      isAuthenticatedGoogle({ ...signals, fromHeader: 'forwarding-noreply@google.com' }),
    ).toBe(false);
  });
});
