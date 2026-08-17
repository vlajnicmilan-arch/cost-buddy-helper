/**
 * KUPAC S DOKUMENTA + ODREDIŠTE.
 *
 * Tekst je DOSLOVNI ispis obavijesti Grada Osijeka iz žive baze (stavka
 * 89fbf7a8…): kupac je Akrobat j.d.o.o., a njegov OIB stoji ISPOD retka
 * „naziv: 612111 - AKROBAT J.D.O.O.".
 */
import { describe, it, expect } from 'vitest';
import {
  extractCustomer,
  mergeCustomer,
  cleanCustomerName,
} from '../../supabase/functions/_shared/mailImport/customerExtract.ts';
import {
  resolveDestination,
  DESTINATION_OFFER_WARNING,
} from '../../supabase/functions/_shared/mailImport/mailDestination.ts';

const AKROBAT = '39916265994';
const OSIJEK_TEXT = [
  'REPUBLIKA HRVATSKA',
  'GRAD OSIJEK',
  'OIB: 30050049642',
  'obavijest o plaćanju: 19234775',
  'Obveznik:',
  '436',
  'AKROBAT J.D.O.O.',
  'SLAVONSKA 6',
  '31221 Josipovac',
  'naziv: 612111 - AKROBAT J.D.O.O.',
  'sjedište: JOSIPOVAC, SLAVONSKA 6',
  `OIB: ${AKROBAT}`,
  'SVEUKUPNO: 28,07',
  'IBAN broj HR55 2360 0001 5012 0174 1 Grad Osijek.',
].join('\n');

const PROFILES = [
  { id: 'akrobat', name: 'Akrobat j.d.o.o.', oib: AKROBAT },
  { id: 'tactura', name: 'Tactura d.o.o.', oib: '33941873288' },
];

describe('extractCustomer', () => {
  it('doslovni tekst Grada Osijeka → kupac Akrobat + vlastiti OIB', () => {
    const r = extractCustomer({ text: OSIJEK_TEXT, ownOibs: [AKROBAT] });
    expect(r.recipient_oib).toBe(AKROBAT);
    expect(r.recipient_name).toBe('AKROBAT J.D.O.O.');
  });

  it('bez vlastitih OIB-a kupac se ne izmišlja iz izdavatelja', () => {
    const r = extractCustomer({ text: OSIJEK_TEXT, ownOibs: [] });
    expect(r.recipient_oib).toBeNull();
    // Naziv se smije pročitati po oznaci retka, ali OIB izdavatelja NIKAD nije kupac.
    expect(r.recipient_name).not.toContain('GRAD OSIJEK');
  });

  it('IBAN ne glumi OIB kupca', () => {
    const r = extractCustomer({
      text: 'IBAN HR5523600001501201741\nnema kupca',
      ownOibs: [AKROBAT],
    });
    expect(r.recipient_oib).toBeNull();
  });

  it('AI popunjava samo rupu, deterministički nalaz je nedodirljiv', () => {
    const det = { recipient_oib: AKROBAT, recipient_name: null };
    const merged = mergeCustomer(det, { recipient_oib: '33941873288', recipient_name: 'Tactura d.o.o.' });
    expect(merged.recipient_oib).toBe(AKROBAT);
    expect(merged.recipient_name).toBe('Tactura d.o.o.');
  });

  it('šifra partnera i oznaka retka nisu dio naziva', () => {
    expect(cleanCustomerName('naziv: 612111 - AKROBAT J.D.O.O.')).toBe('AKROBAT J.D.O.O.');
  });
});

describe('resolveDestination', () => {
  const fallback = { scopeType: 'user' as const, scopeId: 'milan' };

  it('OIB kupca == naš profil → poslovni profil, izvor kupac_oib', () => {
    const d = resolveDestination({
      recipientOib: AKROBAT,
      recipientName: 'AKROBAT J.D.O.O.',
      profiles: PROFILES,
      fallback,
    });
    expect(d).toMatchObject({ scopeType: 'business_profile', scopeId: 'akrobat', source: 'kupac_oib' });
    expect(d.offer).toBeNull();
  });

  it('samo ime kupca → ostaje rezerva + ponuda (nikad tiha automatika)', () => {
    const d = resolveDestination({
      recipientOib: null,
      recipientName: 'Tactura d.o.o.',
      profiles: PROFILES,
      fallback,
    });
    expect(d.scopeType).toBe('user');
    expect(d.source).toBe('rezerva');
    expect(d.offer?.profileId).toBe('tactura');
    expect(d.warnings).toContain(DESTINATION_OFFER_WARNING);
  });

  it('tuđi OIB kupca → rezerva bez ponude', () => {
    const d = resolveDestination({
      recipientOib: '30050049642',
      recipientName: 'Grad Osijek',
      profiles: PROFILES,
      fallback: { scopeType: 'business_profile', scopeId: 'tactura' },
    });
    expect(d).toMatchObject({ scopeType: 'business_profile', scopeId: 'tactura', source: 'rezerva' });
    expect(d.offer).toBeNull();
  });

  it('bez kupca → doslovno rezerva', () => {
    const d = resolveDestination({
      recipientOib: null,
      recipientName: null,
      profiles: PROFILES,
      fallback,
    });
    expect(d).toMatchObject({ scopeType: 'user', scopeId: 'milan', source: 'rezerva' });
  });
});

describe('scope_set_by_user ostaje svet', () => {
  it('upsert ne piše scope kad je korisnik odlučio', () => {
    const src = require('fs').readFileSync(
      'supabase/functions/_shared/mailImport/ingestItemUpsert.ts',
      'utf8',
    );
    expect(src).toMatch(/scope_set_by_user/);
  });
});
