/**
 * ČUVARI PAKETA „POVJERENJE U IZDAVATELJE".
 *
 * Brane koje se NE smiju izgubiti:
 *  - Povjerenje NIKAD ne nastaje tiho: red pregleda MORA slati `remember_issuer`.
 *  - Poznat izdavatelj SMIJE ublažiti prikaz tehničke neprovjerljivosti,
 *    ALI NIKAD kad se ključni podatak (IBAN) promijenio.
 *  - Podekran „Moji izdavatelji" postoji iza prava `mail_uvoz`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { softensTrust, IBAN_ALARM_WARNING } from '@/components/mail/MailReviewList';
import { SETTINGS_CATEGORIES } from '@/components/settings/settingsCategories';

const read = (p: string) => readFileSync(p, 'utf8');

describe('softensTrust — blaža prezentacija samo bez alarma', () => {
  it('poznat izdavatelj bez alarma se ublažava', () => {
    expect(softensTrust(3, [])).toBe(true);
  });

  it('promjena IBAN-a gasi ublažavanje', () => {
    expect(softensTrust(3, [IBAN_ALARM_WARNING])).toBe(false);
  });

  it('nepoznat izdavatelj se nikad ne ublažava', () => {
    expect(softensTrust(0, [])).toBe(false);
  });
});

describe('izričita potvrda pamćenja', () => {
  const src = read('src/components/mail/MailReviewList.tsx');

  it('potvrda šalje remember_issuer u payloadu', () => {
    expect(src).toContain('base.remember_issuer');
  });

  it('kvačica se nudi samo za nepoznatog izdavatelja s OIB-om', () => {
    expect(src).toContain("supplierOib !== '' && knownCount === 0");
  });

  it('IBAN alarm ima vlastiti istaknuti okvir', () => {
    expect(src).toContain('data-testid="iban-alarm"');
  });
});

describe('Moji izdavatelji — podekran', () => {
  it('kategorija e-mail uvoza sadrži sekciju myIssuers', () => {
    const mail = SETTINGS_CATEGORIES.find((c) => c.sections.includes('mailImport'));
    expect(mail?.sections).toContain('myIssuers');
  });

  it('sekcija je iza prava mail_uvoz', () => {
    expect(read('src/components/settings/MyIssuersSection.tsx')).toContain('useMailImportAccess');
  });
});
