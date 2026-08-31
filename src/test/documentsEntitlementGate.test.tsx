/**
 * UVOZ IZ MAILA JE OTVOREN SVIMA (odluka vlasnika proizvoda, 30.8.2026).
 *
 * Ekran `/dokumenti` više nije iza prava `mail_uvoz` — dostupan je svakom
 * prijavljenom korisniku. Pravo utječe isključivo na mjesečnu kvotu
 * (`mail_import_consume_quota()`), koja se NE dira.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/hooks/useMailPendingCount', () => ({
  useMailPendingCount: () => ({ count: 3, loading: false, refetch: vi.fn() }),
}));

vi.mock('@/components/mail/MailQuotaStrip', () => ({
  MailQuotaStrip: () => <div data-testid="mail-quota-strip" />,
}));

vi.mock('@/components/mail/MailReviewList', () => ({
  MailReviewList: () => <div data-testid="mail-review-list" />,
}));

vi.mock('@/components/mail/DocumentsReceivedTab', () => ({
  DocumentsReceivedTab: () => <div data-testid="documents-received" />,
}));

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
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

describe('ekran Dokumenti je otvoren svima', () => {
  it('red „Na pregled" i prikaz kvote su vidljivi bez ikakvog prava', () => {
    renderPage();
    expect(screen.getByTestId('mail-review-list')).toBeTruthy();
    expect(screen.getByTestId('mail-quota-strip')).toBeTruthy();
  });

  it('ekran ne uvjetuje prikaz pravom mail_uvoz', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/Documents.tsx'), 'utf8');
    expect(src).not.toContain('useMailImportAccess');
  });
});

describe('ulaz do Dokumenata postoji izvan Postavki', () => {
  const header = fs.readFileSync(
    path.resolve(__dirname, '../components/home/HomeHeader.tsx'),
    'utf8',
  );
  const row = fs.readFileSync(
    path.resolve(__dirname, '../components/home/DocumentsRow.tsx'),
    'utf8',
  );

  it('stalni red početnog ekrana vodi na /dokumenti', () => {
    expect(row).toContain("navigate('/dokumenti')");
  });

  it('Dokumenti više nisu ikona u zaglavlju', () => {
    expect(header).not.toContain("navigate('/dokumenti')");
  });
});
