import { describe, it, expect, beforeAll } from 'vitest';
import i18n from 'i18next';
import hr from '@/i18n/locales/hr.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';

/**
 * ČUVAR: hrvatska sklonidba brojke na kartici „Dokumenti na pregled".
 * 1 dokument / 2-4 dokumenta / 5+ dokumenata / 21 dokument / 22 dokumenta.
 */
describe('documents.pendingCard.subtitle pluralization', () => {
  beforeAll(async () => {
    await i18n.init({
      lng: 'hr',
      fallbackLng: 'hr',
      resources: {
        hr: { translation: hr },
        en: { translation: en },
        de: { translation: de },
      },
      interpolation: { escapeValue: false },
    });
  });

  const key = 'documents.pendingCard.subtitle';

  it.each([
    [1, 'dokument čeka'],
    [2, 'dokumenta čekaju'],
    [5, 'dokumenata čeka'],
    [21, 'dokument čeka'],
    [22, 'dokumenta čekaju'],
  ])('hr count=%i', (count, expected) => {
    const out = i18n.t(key, { count, lng: 'hr' });
    expect(out).toContain(String(count));
    expect(out).toContain(expected);
  });

  it('en singular/plural', () => {
    expect(i18n.t(key, { count: 1, lng: 'en' })).toContain('1 document awaiting');
    expect(i18n.t(key, { count: 3, lng: 'en' })).toContain('3 documents awaiting');
  });

  it('de singular/plural', () => {
    expect(i18n.t(key, { count: 1, lng: 'de' })).toContain('1 Dokument wartet');
    expect(i18n.t(key, { count: 3, lng: 'de' })).toContain('3 Dokumente warten');
  });
});
