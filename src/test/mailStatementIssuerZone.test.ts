import { describe, expect, it } from 'vitest';
import {
  classifyAsStatement,
  detectBankName,
  issuerZone,
  parseCroatianWordDate,
} from '@/lib/mail/statementSignals';
import { REVOLUT_REAL_SUBJECT, REVOLUT_REAL_TEXT } from './fixtures/revolutStatementHeader';

/**
 * ZONA IZDAVATELJA — identitet dokumenta (banka, IBAN, broj računa, razdoblje,
 * saldo) smije doći SAMO iz zaglavlja. Protustrana iz retka prometa
 * („Primatelj: Pbz7bauhaus") nikad ne smije postati banka.
 */

describe('stvarni Revolut izvod iz baze', () => {
  const v = classifyAsStatement(REVOLUT_REAL_TEXT, REVOLUT_REAL_SUBJECT);

  it('i dalje je izvod', () => {
    expect(v.isStatement).toBe(true);
  });

  it('banka je Revolut, nikad PBZ iz retka prometa', () => {
    expect(v.extraction.bank_name).toBe('Revolut');
  });

  it('IBAN je litavski i mod-97 valjan', () => {
    expect(v.extraction.account_iban).toBe('LT183250041594525319');
  });

  it('razdoblje se čita iz hrvatskih naziva mjeseci', () => {
    expect(v.extraction.period_from).toBe('2025-07-02');
    expect(v.extraction.period_to).toBe('2026-08-10');
  });

  it('završni saldo dolazi iz retka „Ukupno" pod stupcem „Završni saldo"', () => {
    expect(v.extraction.closing_balance).toBe(4957.71);
  });

  it('zona izdavatelja staje prije prvog retka prometa', () => {
    const zone = issuerZone(REVOLUT_REAL_TEXT.split('\n'));
    expect(zone[zone.length - 1]).toContain('Na čekanju od');
    expect(zone.some((l) => /Pbz7bauhaus/.test(l))).toBe(false);
  });
});

describe('pošteno prazno umjesto krivog', () => {
  const NO_BANK_HEADER = [
    'IZVOD PROMETA PO RAČUNU',
    'Klijent Milan Vlajnić',
    'Razdoblje 01.06.2026. - 30.06.2026.',
    'Početno stanje 0,02',
    'Završno stanje 0,02',
    'Datum Opis Iznos Stanje',
    '05.06.2026. Placanje PBZ POS Zadar -10,00 0,02',
    '06.06.2026. Uplata PBZ 10,00 10,02',
    '07.06.2026. Placanje PBZ -5,00 5,02',
    '08.06.2026. Placanje PBZ -1,00 4,02',
    '09.06.2026. Placanje PBZ -4,00 0,02',
  ].join('\n');

  it('banka iz retka prometa ne postaje banka izvoda', () => {
    const v = classifyAsStatement(NO_BANK_HEADER);
    expect(v.isStatement).toBe(true);
    expect(v.extraction.bank_name).toBeNull();
  });

  it('detectBankName ne izmišlja iz praznog zaglavlja', () => {
    expect(detectBankName('Izvod prometa\nKlijent Ivan')).toBeNull();
  });

  it('naslov e-maila sam ne može stvoriti banku', () => {
    expect(detectBankName('Izvod prometa\nKlijent Ivan', 'Revolut izvod')).toBeNull();
  });

  it('naslov razrješava višeznačnost kad zaglavlje nudi dva kandidata', () => {
    const zone = 'Revolut Bank UAB\nPlaćanja putem PBZ mreže';
    expect(detectBankName(zone, 'Revolut izvod')).toBe('Revolut');
  });
});

describe('hrvatski datumi s imenom mjeseca', () => {
  it('puni genitiv i kratica daju isti ISO', () => {
    expect(parseCroatianWordDate('2. srpnja 2025.')).toBe('2025-07-02');
    expect(parseCroatianWordDate('10. kol 2026.')).toBe('2026-08-10');
    expect(parseCroatianWordDate('1. studenoga 2026.')).toBe('2026-11-01');
  });

  it('nepoznata riječ ne postaje datum', () => {
    expect(parseCroatianWordDate('2. nekog 2025.')).toBeNull();
  });
});

describe('regresije Erste i KEKS', () => {
  const ERSTE = [
    'Erste&Steiermärkische Bank d.d.',
    'Izvod br. 152',
    'IBAN: HR7324020061101086163',
    'Broj računa: 1101086163',
    'Prethodno stanje 461,94',
    'Promet duguje 300,00 potražuje 82,91',
    'Konačno stanje: 244,85',
  ].join('\n');

  const KEKS = [
    'IZVOD PROMETA PO RAČUNU',
    'Klijent Milan Vlajnić',
    'Broj računa 42323975',
    'Razdoblje 01.06.2026. - 30.06.2026.',
    'Početno stanje 0,02',
    'Završno stanje 0,02',
    'Redni broj Datum Iznos Opis Stanje',
    '1 05.06.2026. -10,00 Placanje 0,02',
    '2 06.06.2026. 10,00 Uplata 10,02',
    '3 07.06.2026. -5,00 Placanje 5,02',
    '4 08.06.2026. -1,00 Placanje 4,02',
    '5 09.06.2026. -4,00 Placanje 0,02',
  ].join('\n');

  it('Erste ostaje Erste s HR IBAN-om i saldom', () => {
    const v = classifyAsStatement(ERSTE);
    expect(v.isStatement).toBe(true);
    expect(v.extraction.bank_name).toBe('Erste');
    expect(v.extraction.account_iban).toBe('HR7324020061101086163');
    expect(v.extraction.closing_balance).toBe(244.85);
  });

  it('KEKS zadržava broj računa i završno stanje', () => {
    const v = classifyAsStatement(KEKS);
    expect(v.extraction.account_number).toBe('42323975');
    expect(v.extraction.account_iban).toBeNull();
    expect(v.extraction.closing_balance).toBe(0.02);
    expect(v.extraction.period_from).toBe('2026-06-01');
    expect(v.extraction.period_to).toBe('2026-06-30');
  });
});
