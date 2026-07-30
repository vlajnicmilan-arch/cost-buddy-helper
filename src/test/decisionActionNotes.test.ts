/**
 * Faza 4 / točka 21 — grananje poruka odluka po akciji.
 */
import { describe, it, expect } from 'vitest';
import { decisionActionNoteKey } from '@/components/projects/ProjectDecisionsTab';
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

describe('decisionActionNoteKey', () => {
  it('accept → acceptedNote', () => {
    expect(decisionActionNoteKey('accept')).toBe('projects.decisions.acceptedNote');
  });
  it('reject → declinedNote', () => {
    expect(decisionActionNoteKey('reject')).toBe('projects.decisions.declinedNote');
  });
  it('counter → counterNote', () => {
    expect(decisionActionNoteKey('counter')).toBe('projects.decisions.counterNote');
  });
  it('ostale akcije → actionRecorded', () => {
    for (const a of ['propose', 'correction'] as const) {
      expect(decisionActionNoteKey(a)).toBe('projects.decisions.actionRecorded');
    }
  });
});

describe('i18n — novi ključevi odluka (hr/en/de)', () => {
  const catalogs = { hr, en, de } as const;
  const keys = [
    'projects.decisions.acceptedNote',
    'projects.decisions.declinedNote',
    'projects.decisions.counterNote',
  ];

  it.each(keys)('%s ima naslov i opis u sva 3 jezika', (key) => {
    for (const [lang, cat] of Object.entries(catalogs)) {
      const value = get(cat, key);
      expect(typeof value, `${lang}:${key}`).toBe('string');
      const parts = (value as string).split('\n');
      expect(parts.length, `${lang}:${key}`).toBe(2);
      expect(parts[0].length, `${lang}:${key}`).toBeGreaterThan(0);
      expect(parts[1].length, `${lang}:${key}`).toBeGreaterThan(0);
    }
  });

  it('emoji 🤝 samo na accept poruci', () => {
    for (const cat of Object.values(catalogs)) {
      expect(get(cat, 'projects.decisions.acceptedNote')).toContain('🤝');
      expect(get(cat, 'projects.decisions.declinedNote')).not.toContain('🤝');
      expect(get(cat, 'projects.decisions.counterNote')).not.toContain('🤝');
    }
  });

  it('hr tekstovi doslovno', () => {
    expect(get(hr, 'projects.decisions.acceptedNote')).toBe('Odluka prihvaćena 🤝\nObje strane sada vide isto.');
    expect(get(hr, 'projects.decisions.declinedNote')).toBe('Odbijeno\nDruga strana će vidjeti tvoj odgovor.');
    expect(get(hr, 'projects.decisions.counterNote')).toBe('Protuprijedlog poslan\nDruga strana odlučuje sljedeća.');
  });
});
