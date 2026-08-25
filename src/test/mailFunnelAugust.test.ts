/**
 * ČUVARI MAIL LIJEVKA (nalog 25.8.2026).
 *
 *  1. Račun bez identiteta izvoda NE smije završiti kao izvod (HEP plin).
 *  2. Pravi izvod se NE smije oteti — doslovan izvod-rječnik je veto.
 *  3. Račun + potvrda plaćanja iz iste poruke = jedna obveza.
 */
import { describe, it, expect } from 'vitest';
import {
  invoiceOverridesStatement,
  lacksStatementIdentity,
} from '../../supabase/functions/_shared/mailImport/invoiceOverride.ts';
import { findSiblingDocuments } from '@/lib/mail/siblingDocuments';

/** Skraćeni, ali doslovni tekst stavke 031dd119 (HEP OPSKRBA PLINOM). */
const HEP_TEXT = `BESPLATNI TELEFON 0800 88 13
OIB | 60155964806
IBAN: HR0624070001500029673Račun za srpanj 2026.
Broj 260965608-HO1-P1
Ukupno 1,88 €Pregled zaduženja i uplata
Vaš OIB | 39916265994
Datum i mjesto izdavanja računa | 31.07.2026., Osijek
Datum dospijeća računa | 31.08.2026.
Iznos računa s PDV-om 1,40 €
Rok plaćanja: 31.08.2026`;

const NO_IDENTITY = { bank_name: null, statement_number: null, closing_balance: null };

describe('invoiceOverridesStatement — izvod bez identiteta nije izvod', () => {
  it('HEP-ov račun za plin nadjačava sumnju na izvod', () => {
    expect(
      invoiceOverridesStatement({
        text: HEP_TEXT,
        subject: 'Račun za srpanj 2026.',
        statementExtraction: NO_IDENTITY,
        ownOibs: ['39916265994'],
      }),
    ).toBe(true);
  });

  it('nadjačavanje pada čim izvod ima vlastiti identitet', () => {
    expect(
      invoiceOverridesStatement({
        text: HEP_TEXT,
        subject: 'Račun za srpanj 2026.',
        statementExtraction: { bank_name: 'Erste', statement_number: null, closing_balance: null },
        ownOibs: ['39916265994'],
      }),
    ).toBe(false);
    expect(
      invoiceOverridesStatement({
        text: HEP_TEXT,
        subject: 'Račun',
        statementExtraction: { bank_name: null, statement_number: null, closing_balance: 120.5 },
      }),
    ).toBe(false);
  });

  it('doslovan izvod-rječnik je veto — pravi izvod se ne otima', () => {
    expect(
      invoiceOverridesStatement({
        text: `Izvod broj 12 po transakcijskom računu\nRok plaćanja: 01.09.2026\nRačun broj 5`,
        subject: 'Izvod',
        statementExtraction: NO_IDENTITY,
      }),
    ).toBe(false);
  });

  it('jedna usamljena oznaka računa nije dovoljna', () => {
    expect(
      invoiceOverridesStatement({
        text: 'Rok plaćanja: 01.09.2026',
        subject: null,
        statementExtraction: NO_IDENTITY,
      }),
    ).toBe(false);
  });

  it('korisnikova odluka „ovo je izvod" gasi nadjačavanje', () => {
    expect(
      invoiceOverridesStatement({
        text: HEP_TEXT,
        subject: 'Račun za srpanj 2026.',
        statementExtraction: NO_IDENTITY,
        userClassification: 'izvod',
      }),
    ).toBe(false);
  });

  it('lacksStatementIdentity prepoznaje prazan identitet', () => {
    expect(lacksStatementIdentity(NO_IDENTITY)).toBe(true);
    expect(lacksStatementIdentity({ statement_number: '2026/08' })).toBe(false);
  });
});

describe('findSiblingDocuments — račun i potvrda iz iste poruke', () => {
  const base = { message_id: 'msg-1', invoiceNumber: 'DFWF2F5F0093' };

  it('naziv datoteke odaje potvrdu plaćanja', () => {
    const map = findSiblingDocuments([
      { id: 'a', ...base, fileName: 'Invoice-DFWF2F5F0093.pdf', createdAt: '2026-08-24T10:00:00Z' },
      { id: 'b', ...base, fileName: 'Receipt-DFWF2F5F0093.pdf', createdAt: '2026-08-24T10:00:00Z' },
    ]);
    expect(map.get('b')?.role).toBe('receipt');
    expect(map.get('a')?.role).toBe('invoice');
    expect(map.get('a')?.siblingId).toBe('b');
  });

  it('bez natuknice u nazivu potvrda je ona koja je stigla kasnije', () => {
    const map = findSiblingDocuments([
      { id: 'a', ...base, fileName: 'doc1.pdf', createdAt: '2026-08-24T10:00:00Z' },
      { id: 'b', ...base, fileName: 'doc2.pdf', createdAt: '2026-08-24T11:00:00Z' },
    ]);
    expect(map.get('b')?.role).toBe('receipt');
  });

  it('različite poruke ili različit broj = nema veze', () => {
    expect(
      findSiblingDocuments([
        { id: 'a', message_id: 'msg-1', invoiceNumber: 'X1', fileName: null, createdAt: '1' },
        { id: 'b', message_id: 'msg-2', invoiceNumber: 'X1', fileName: null, createdAt: '2' },
        { id: 'c', message_id: 'msg-1', invoiceNumber: 'X2', fileName: null, createdAt: '3' },
      ]).size,
    ).toBe(0);
  });

  it('stavka bez broja dokumenta se ne grupira', () => {
    expect(
      findSiblingDocuments([
        { id: 'a', message_id: 'msg-1', invoiceNumber: null, fileName: null, createdAt: '1' },
        { id: 'b', message_id: 'msg-1', invoiceNumber: null, fileName: null, createdAt: '2' },
      ]).size,
    ).toBe(0);
  });
});
