/**
 * Faza 4 — tekstovi obavijesti.
 * 1) CentarNote split logika: poruka s '\n' → naslov + opis; bez '\n' → nepromijenjeno.
 * 2) i18n konzistentnost: svi odobreni ključevi postoje u hr/en/de i imaju
 *    isti oblik (s prijelomom ili bez).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CentarNote from '@/components/CentarNote';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

const get = (obj: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);

const MULTILINE_KEYS = [
  'common.error',
  'errors.generic',
  'errors.saveError',
  'toasts.importError',
  'feedback.expenseAdded',
  'common.deleted',
  'toasts.deleted',
  'import.importedTransactions',
  'import.importedWithAutoMerge',
  'import.importedFromPDF',
  'toasts.pdfReportGenerated',
  'openBanking.syncError',
  'bankMatch.merged',
  'bankMatch.dismissed',
  'krug.member.add.success',
  'krug.member.remove.success',
  'krug.settlement.pdf.exportSuccess',
  'projects.created',
  'projects.complete.success',
  'projects.decisions.admin.requestSent',
];

const SINGLE_LINE_KEYS = ['feedback.mustBeLoggedIn', 'errors.mustBeLoggedIn'];

describe('CentarNote — split naslov/opis', () => {
  it("poruka s '\\n' → naslov + opis", () => {
    render(
      <CentarNote severity="info" module="wallet" message={'Obrisano\nMožeš vratiti.'} duration={3000} />,
    );
    expect(screen.getByTestId('centar-note-title').textContent).toBe('Obrisano');
    expect(screen.getByTestId('centar-note-description').textContent).toBe('Možeš vratiti.');
  });

  it("bez '\\n' → nema zasebnog naslova (ponašanje kao dosad)", () => {
    render(<CentarNote severity="info" module="wallet" message="Spremljeno" duration={3000} />);
    expect(screen.queryByTestId('centar-note-title')).toBeNull();
    expect(screen.getByTestId('centar-note-description').textContent).toBe('Spremljeno');
  });

  it('dijeli samo na PRVOM prijelomu — opis zadržava ostatak', () => {
    render(
      <CentarNote
        severity="error"
        module="krug"
        message={'Naslov\nPrvi red — s crticom.\nDrugi red.'}
        duration={0}
      />,
    );
    expect(screen.getByTestId('centar-note-title').textContent).toBe('Naslov');
    expect(screen.getByTestId('centar-note-description').textContent).toBe(
      'Prvi red — s crticom.\nDrugi red.',
    );
  });

  it('eksplicitni title ima prednost — poruka se ne dijeli', () => {
    render(
      <CentarNote
        severity="info"
        module="wallet"
        title="Naslov"
        message={'A\nB'}
        duration={3000}
      />,
    );
    expect(screen.getByTestId('centar-note-title').textContent).toBe('Naslov');
    expect(screen.getByTestId('centar-note-description').textContent).toBe('A\nB');
  });
});

describe('i18n — odobreni tekstovi obavijesti (hr/en/de)', () => {
  const catalogs = { hr, en, de } as const;

  it.each(MULTILINE_KEYS)('%s ima naslov i opis u sva 3 jezika', (key) => {
    for (const [lang, cat] of Object.entries(catalogs)) {
      const value = get(cat, key);
      expect(typeof value, `${lang}:${key}`).toBe('string');
      const parts = (value as string).split('\n');
      expect(parts.length, `${lang}:${key}`).toBeGreaterThanOrEqual(2);
      expect(parts[0].length, `${lang}:${key}`).toBeGreaterThan(0);
      expect(parts.slice(1).join('\n').length, `${lang}:${key}`).toBeGreaterThan(0);
    }
  });

  it.each(SINGLE_LINE_KEYS)('%s je jednoredni tekst u sva 3 jezika', (key) => {
    for (const [lang, cat] of Object.entries(catalogs)) {
      const value = get(cat, key);
      expect(typeof value, `${lang}:${key}`).toBe('string');
      expect((value as string).includes('\n'), `${lang}:${key}`).toBe(false);
    }
  });

  it('interpolacijske varijable ostaju u uvoznim porukama', () => {
    for (const cat of Object.values(catalogs)) {
      expect(get(cat, 'import.importedTransactions')).toContain('{{count}}');
      expect(get(cat, 'import.importedFromPDF')).toContain('{{count}}');
      expect(get(cat, 'import.importedWithAutoMerge')).toContain('{{merged}}');
    }
  });
});
