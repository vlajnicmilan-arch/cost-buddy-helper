/**
 * ČUVAR — USMJERAVANJE MAIL DOKUMENTA PO OIB-u PRIMATELJA.
 *
 * Tvrdimo samo nedvosmisleno: točno jedan vlastiti OIB u tekstu = tvrtka;
 * nijedan = osobno; dva = osobno + upozorenje. Atribucija se NIKAD ne mijenja.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveScope,
  MULTIPLE_OWN_OIB_WARNING,
} from '../../supabase/functions/_shared/mailImport/scopeRouting.ts';
import hr from '../i18n/locales/hr.json';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import { PROBABLE_DUPLICATE_WARNING } from '../../supabase/functions/_shared/mailImport/softDuplicate.ts';

// Valjani OIB-i (ISO 7064).
const OIB_A = '12345678903';
const OIB_B = '69435151530';
const OWNER = 'owner-uuid';

const own = [
  { oib: OIB_A, profileId: 'profil-a' },
  { oib: OIB_B, profileId: 'profil-b' },
];

describe('resolveScope', () => {
  it('točno jedan vlastiti OIB → biznis profil', () => {
    const r = resolveScope({ text: `Kupac OIB: ${OIB_A}`, ownOibs: own, ownerId: OWNER });
    expect(r.scopeType).toBe('business_profile');
    expect(r.scopeId).toBe('profil-a');
    expect(r.warnings).toEqual([]);
  });

  it('nijedan vlastiti OIB → osobno, bez upozorenja', () => {
    const r = resolveScope({ text: 'Dobavljac OIB: 69435151530x', ownOibs: [], ownerId: OWNER });
    expect(r.scopeType).toBe('user');
    expect(r.scopeId).toBe(OWNER);
    expect(r.warnings).toEqual([]);
  });

  it('dva vlastita OIB-a → osobno + upozorenje', () => {
    const r = resolveScope({
      text: `Kupac ${OIB_A} / ${OIB_B}`,
      ownOibs: own,
      ownerId: OWNER,
    });
    expect(r.scopeType).toBe('user');
    expect(r.scopeId).toBe(OWNER);
    expect(r.warnings).toEqual([MULTIPLE_OWN_OIB_WARNING]);
  });

  it('OIB skriven unutar IBAN-a se ne broji', () => {
    const r = resolveScope({
      text: 'IBAN HR1210010051863000160',
      ownOibs: own,
      ownerId: OWNER,
    });
    expect(r.scopeType).toBe('user');
  });
});

describe('prijevodi novih upozorenja', () => {
  for (const [lang, cat] of Object.entries({ hr, en, de }) as Array<[string, any]>) {
    it(`${lang} ima rečenice`, () => {
      expect(cat.mailReview.warning[MULTIPLE_OWN_OIB_WARNING]).toBeTruthy();
      expect(cat.mailReview.warning[PROBABLE_DUPLICATE_WARNING]).toBeTruthy();
      expect(cat.documents.scope.personal).toBeTruthy();
    });
  }
});
