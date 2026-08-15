import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { shouldFallbackToHome } from '@/lib/navigation/goBackOrHome';
import { isProvableTarget } from '@/lib/brief/destinations';
import { buildBriefMessages } from '@/lib/brief/engine';
import Documents from '@/pages/Documents';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));

vi.mock('@/hooks/useMailImportAccess', () => ({
  useMailImportAccess: () => ({ hasAccess: true, loading: false }),
}));
vi.mock('@/hooks/useMailPendingCount', () => ({
  useMailPendingCount: () => ({ count: 0, refetch: () => undefined }),
}));
vi.mock('@/components/mail/MailReviewList', () => ({ MailReviewList: () => <div>PENDING</div> }));
vi.mock('@/components/mail/DocumentsReceivedTab', () => ({
  DocumentsReceivedTab: () => <div>RECEIVED</div>,
}));

const renderDocuments = (entries: string[], initialIndex?: number) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/dokumenti" element={<Documents />} />
        <Route path="/app" element={<div>CENTAR</div>} />
        <Route path="/negdje" element={<div>NEGDJE</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('povratak bez zamke', () => {
  it('prva stavka povijesti => Centar', () => {
    expect(shouldFallbackToHome({ historyIdx: 0, locationKey: 'abc' })).toBe(true);
  });

  it('postoji povijest => navigate(-1)', () => {
    expect(shouldFallbackToHome({ historyIdx: 2, locationKey: 'abc' })).toBe(false);
  });

  it('bez idx-a pada na locationKey', () => {
    expect(shouldFallbackToHome({ historyIdx: null, locationKey: 'default' })).toBe(true);
    expect(shouldFallbackToHome({ historyIdx: null, locationKey: 'x1' })).toBe(false);
  });

  it('/dokumenti kao prva stavka: povratak vodi u Centar', () => {
    renderDocuments(['/dokumenti']);
    fireEvent.click(screen.getByLabelText('Natrag'));
    expect(screen.getByText('CENTAR')).toBeTruthy();
  });

  it('/dokumenti iz normalne navigacije: povratak vraća na prethodni ekran', () => {
    renderDocuments(['/negdje', '/dokumenti'], 1);
    fireEvent.click(screen.getByLabelText('Natrag'));
    expect(screen.getByText('NEGDJE')).toBeTruthy();
  });
});

describe('dokaziva destinacija', () => {
  it('uncertainty i due su dokazivi, mail (tab=received) nije', () => {
    expect(isProvableTarget('uncertainty', { path: '/dokumenti', tab: 'pending' })).toBe(true);
    expect(isProvableTarget('due', { path: '/home', view: 'overdue' })).toBe(true);
    expect(isProvableTarget('mail', { path: '/dokumenti', tab: 'received' })).toBe(false);
  });

  it('mail poruka se ne prikazuje dok odredište ne postoji (MIRNO fallback)', () => {
    const messages = buildBriefMessages({
      snapshot: {
        enabled: true,
        categories: {
          mail: { count: 4, watermark: '2026-08-15T08:00:00Z', filter: { path: '/dokumenti', tab: 'received' } },
        },
      },
      continuity: {},
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].category).toBe('calm');
  });
});
