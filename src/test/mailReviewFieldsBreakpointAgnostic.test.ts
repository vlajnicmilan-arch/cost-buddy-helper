/**
 * ČUVAR — polja pregleda mail stavke.
 *
 * Kvar (kolovoz 2026): korisnik je „Oznaku mjesta" vidio na mobitelu, a na
 * laptopu ne. Uzrok NIJE bio uvjetni prikaz — ovaj čuvar to i drži tako:
 * FIELDS je jedina lista polja, renderira se ISTO na svim širinama i nijedno
 * polje ne smije dobiti breakpoint/hidden klasu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../components/mail/MailReviewList.tsx'), 'utf8');

const fieldKeys = [...SRC.matchAll(/\{\s*key:\s*'([a-z_]+)'/g)].map((m) => m[1]);

describe('MailReviewList — polja neovisna o širini', () => {
  it('sadrži oznaku mjesta u jedinoj listi polja', () => {
    expect(fieldKeys).toContain('place_label');
  });

  it('lista polja postoji točno jednom (nema odvojenog desktop layouta)', () => {
    expect(SRC.match(/const FIELDS: FieldDef\[\]/g)?.length).toBe(1);
  });

  it('svako renderiranje polja ide kroz FIELDS.map — bez filtriranja/rezanja', () => {
    const maps = SRC.match(/FIELDS\.map\(/g) ?? [];
    expect(maps.length).toBeGreaterThanOrEqual(2);
    expect(SRC).not.toMatch(/FIELDS\.(slice|filter)\(/);
  });

  it('nema responsive skrivanja polja', () => {
    expect(SRC).not.toMatch(/(sm|md|lg|xl):hidden/);
    expect(SRC).not.toMatch(/hidden\s+(sm|md|lg):/);
    expect(SRC).not.toMatch(/useIsMobile|matchMedia/);
  });
});
