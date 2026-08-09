/**
 * ČUVARI PAMĆENJA IZDAVATELJA I MJESTA (nalog D2–D4).
 *
 * Brane koje se NE smiju izgubiti:
 *  - Solin ≠ Split: oznaka mjesta samo uz TOČNU šifru obračunskog mjesta;
 *    račun bez šifre nikad ne dobije oznaku (fallback daje samo OIB/naziv).
 *  - Forwarder brana: proslijeđena poruka s korisnikove adrese ne smije
 *    postati ključ pamćenja — ključ pada na OIB.
 *  - Nikad se ne gazi već popunjeno polje (determinizam/AI pobjeđuju).
 */
import { describe, it, expect } from 'vitest';
import {
  memoryFill,
  issuerKeyDomain,
  MEMORY_FILL_WARNING,
  type IssuerMemoryRow,
} from '../../supabase/functions/_shared/mailImport/issuerMemory.ts';
import { findPlaceCode } from '../../supabase/functions/_shared/mailImport/paymentReference.ts';

const ROWS: IssuerMemoryRow[] = [
  {
    from_domain: 'vodovod.hr',
    supplier_oib: '12345678903',
    place_code: '11111',
    supplier_name: 'Vodovod d.o.o.',
    place_label: 'Split',
  },
  {
    from_domain: 'vodovod.hr',
    supplier_oib: '12345678903',
    place_code: '22222',
    supplier_name: 'Vodovod d.o.o.',
    place_label: 'Solin',
  },
  {
    from_domain: 'vodovod.hr',
    supplier_oib: '12345678903',
    place_code: '',
    supplier_name: 'Vodovod d.o.o.',
    place_label: null,
  },
];

const fill = (placeCode: string, extraction: Record<string, unknown> = {}, opts: Partial<Parameters<typeof memoryFill>[0]> = {}) =>
  memoryFill({ extraction, placeCode, fromDomain: 'vodovod.hr', rows: ROWS, ...opts });

describe('memoryFill — Solin ≠ Split', () => {
  it('točna šifra mjesta daje pripadnu oznaku', () => {
    expect(fill('11111').extraction.place_label).toBe('Split');
    expect(fill('22222').extraction.place_label).toBe('Solin');
  });

  it('račun bez šifre NE dobiva oznaku mjesta, ali dobiva OIB/naziv', () => {
    const r = fill('');
    expect(r.extraction.place_label).toBeUndefined();
    expect(r.extraction.supplier_oib).toBe('12345678903');
    expect(r.extraction.supplier_name).toBe('Vodovod d.o.o.');
  });

  it('nepoznata šifra mjesta = fallback bez oznake', () => {
    const r = fill('99999');
    expect(r.extraction.place_label).toBeUndefined();
    expect(r.extraction.supplier_oib).toBe('12345678903');
  });
});

describe('memoryFill — ostala pravila', () => {
  it('ne gazi već popunjena polja', () => {
    const r = fill('11111', { supplier_oib: '69435151530', supplier_name: 'Ručno', place_label: 'Kaštela' });
    expect(r.extraction.supplier_oib).toBe('69435151530');
    expect(r.extraction.supplier_name).toBe('Ručno');
    expect(r.extraction.place_label).toBe('Kaštela');
    expect(r.applied).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it('pogodak emitira upozorenje dopunjeno_iz_zapamcenog', () => {
    expect(fill('11111').warnings).toEqual([MEMORY_FILL_WARNING]);
  });

  it('šifra mjesta uvijek putuje uz stavku (ključ za učenje)', () => {
    expect(fill('22222').extraction.place_code).toBe('22222');
    expect(fill('').extraction.place_code).toBeUndefined();
  });

  it('UBL grana smije dobiti SAMO oznaku mjesta', () => {
    const r = fill('11111', {}, { onlyPlaceLabel: true });
    expect(r.extraction.place_label).toBe('Split');
    expect(r.extraction.supplier_oib).toBeUndefined();
    expect(r.extraction.supplier_name).toBeUndefined();
  });

  it('bez ključa (nepoznata domena, bez OIB-a) ne radi ništa', () => {
    const r = memoryFill({ extraction: {}, placeCode: '11111', fromDomain: '', rows: ROWS });
    expect(r.applied).toBe(false);
    expect(r.extraction.supplier_oib).toBeUndefined();
  });

  it('ključ pada na OIB kad je domena prazna (forwarder)', () => {
    const r = memoryFill({
      extraction: { supplier_oib: '12345678903' },
      placeCode: '22222',
      fromDomain: '',
      rows: ROWS,
    });
    expect(r.extraction.place_label).toBe('Solin');
  });

  it('nejednoznačno pamćenje (dva različita OIB-a) ne dopunjava', () => {
    const rows: IssuerMemoryRow[] = [
      { ...ROWS[0], supplier_oib: '12345678903' },
      { ...ROWS[0], supplier_oib: '69435151530' },
    ];
    const r = memoryFill({ extraction: {}, placeCode: '11111', fromDomain: 'vodovod.hr', rows });
    expect(r.applied).toBe(false);
  });
});

describe('issuerKeyDomain — forwarder brana', () => {
  it('javni mailovi ne postaju ključ', () => {
    expect(issuerKeyDomain('Milan <milan@gmail.com>')).toBe('');
    expect(issuerKeyDomain('milan@net.hr')).toBe('');
  });

  it('korisnikova vlastita domena ne postaje ključ', () => {
    expect(issuerKeyDomain('racuni@mojafirma.hr', ['mojafirma.hr'])).toBe('');
  });

  it('domena izdavatelja se koristi', () => {
    expect(issuerKeyDomain('"Vodovod" <racuni@vodovod.hr>')).toBe('vodovod.hr');
  });
});

describe('findPlaceCode — samo sidrena šifra', () => {
  it('hvata šifru uz ključnu riječ', () => {
    expect(findPlaceCode('Šifra kupca: 123456').placeCode).toBeTruthy();
  });

  it('goli broj bez sidra ne prolazi', () => {
    expect(findPlaceCode('Ukupno 123456 EUR').placeCode).toBe('');
  });
});
