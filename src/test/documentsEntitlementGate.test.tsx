/**
 * ČUVAR PRAVA `mail_uvoz` (nalog #5).
 *
 * Sve novo iz naloga #5 (kartica na početnom ekranu, ekran /dokumenti) postoji
 * ISKLJUČIVO za korisnike s pravom `mail_uvoz`. Bez prava UI ne smije ponuditi
 * nijedan trag te značajke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const { hasAccessRef, navigate } = vi.hoisted(() => ({
  hasAccessRef: { current: false },
  navigate: vi.fn(),
}));

vi.mock('@/hooks/useMailImportAccess', () => ({
  useMailImportAccess: () => ({ hasAccess: hasAccessRef.current, loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useMailPendingCount', () => ({
  useMailPendingCount: () => ({ count: 3, loading: false, refetch: vi.fn() }),
}));

vi.mock('@/components/mail/MailReviewList', () => ({
  MailReviewList: () => <div data-testid="mail-review-list" />,
}));

vi.mock('@/components/mail/DocumentsReceivedTab', () => ({
  DocumentsReceivedTab: () => <div data-testid="documents-received" />,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k }),
}));

import { MemoryRouter } from 'react-router-dom';
import Documents from '@/pages/Documents';

const renderPage = () =>
  render(
    <MemoryRouter>
      <Documents />
    </MemoryRouter>,
  );

describe('pravo mail_uvoz čuva ekran Dokumenti', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it('bez prava: ništa se ne prikazuje i korisnik se vraća na /app', () => {
    hasAccessRef.current = false;
    renderPage();
    expect(screen.queryByTestId('mail-review-list')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/app', { replace: true });
  });

  it('s pravom: red „Na pregled" je vidljiv', () => {
    hasAccessRef.current = true;
    renderPage();
    expect(screen.getByTestId('mail-review-list')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('početni ekran ne pokazuje ništa bez prava', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/home/PersonalModeView.tsx'),
    'utf8',
  );

  it('kartica dokumenata je iza hasMailAccess', () => {
    expect(src).toMatch(/hasMailAccess && mailPendingCount > 0 && \(\s*<DocumentsPendingCard/);
  });

  it('osobni prikaz ulaznih računa je iza hasMailAccess', () => {
    expect(src).toContain('{(isBusinessChip || hasMailAccess) && <IncomingInvoicesWidget />}');
  });
});
