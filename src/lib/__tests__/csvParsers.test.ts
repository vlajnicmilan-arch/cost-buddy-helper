import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  parseDate,
  isInternalTransfer,
  mapSourceToPaymentSource,
  detectPaymentSourceFromDescription,
  extractCardInfo,
  enrichDescription,
  detectCSVFormat,
  parseCSVString,
  categorizeTransaction,
} from '../csvParsers';

describe('parseAmount', () => {
  it('parsira EU format s decimalom (123,45)', () => {
    expect(parseAmount('123,45')).toBeCloseTo(123.45);
  });

  it('parsira EU format s tisućicama (1.234,56)', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
  });

  it('parsira US format s tisućicama (1,234.56)', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
  });

  it('parsira tisuće bez decimala (1,234)', () => {
    expect(parseAmount('1,234')).toBeCloseTo(1234);
  });

  it('uklanja simbole valuta', () => {
    expect(parseAmount('€ 99,99')).toBeCloseTo(99.99);
    expect(parseAmount('100,00 HRK')).toBeCloseTo(100);
  });

  it('vraća apsolutnu vrijednost za negativne iznose', () => {
    expect(parseAmount('-50,00')).toBeCloseTo(50);
  });

  it('vraća 0 za neispravan input', () => {
    expect(parseAmount('abc')).toBe(0);
    expect(parseAmount('')).toBe(0);
  });
});

describe('parseDate', () => {
  it('parsira ISO format (YYYY-MM-DD)', () => {
    const d = parseDate('2026-03-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parsira EU format s točkama (DD.MM.YYYY)', () => {
    const d = parseDate('15.03.2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parsira EU format s kosima (DD/MM/YYYY)', () => {
    const d = parseDate('15/03/2026');
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('parsira dvocifrenu godinu (DD.MM.YY → 20YY)', () => {
    const d = parseDate('15.03.26');
    expect(d.getFullYear()).toBe(2026);
  });

  it('parsira jednocifren dan/mjesec', () => {
    const d = parseDate('5.3.2026');
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(5);
  });
});

describe('isInternalTransfer', () => {
  it('detektira Aircash top-up', () => {
    expect(isInternalTransfer('Uplata na Aircash')).toBe(true);
    expect(isInternalTransfer('AIRCASH TOP UP')).toBe(true);
  });

  it('detektira Revolut top-up', () => {
    expect(isInternalTransfer('Revolut top up')).toBe(true);
    expect(isInternalTransfer('Money added via Apple Pay')).toBe(true);
  });

  it('detektira ATM/bankomat operacije', () => {
    expect(isInternalTransfer('Bankomat podizanje')).toBe(true);
    expect(isInternalTransfer('ATM withdrawal Zagreb')).toBe(true);
  });

  it('detektira prijenose između vlastitih računa', () => {
    expect(isInternalTransfer('Prijenos na vlastiti račun')).toBe(true);
    expect(isInternalTransfer('Internal transfer')).toBe(true);
  });

  it('vraća false za regularne transakcije', () => {
    expect(isInternalTransfer('Konzum Maksimirska')).toBe(false);
    expect(isInternalTransfer('Netflix subscription')).toBe(false);
  });
});

describe('mapSourceToPaymentSource', () => {
  it('mapira poznate izvore', () => {
    expect(mapSourceToPaymentSource('Revolut')).toBe('revolut');
    expect(mapSourceToPaymentSource('Aircash')).toBe('aircash');
    expect(mapSourceToPaymentSource('PBZ')).toBe('bank');
    expect(mapSourceToPaymentSource('Erste banka')).toBe('bank');
    expect(mapSourceToPaymentSource('Crypto wallet')).toBe('crypto');
    expect(mapSourceToPaymentSource('Gotovina')).toBe('cash');
  });

  it('vraća "other" za nepoznat izvor', () => {
    expect(mapSourceToPaymentSource('Neki random')).toBe('other');
  });
});

describe('detectPaymentSourceFromDescription', () => {
  it('detektira Visa Platinum prije generičke Visa', () => {
    expect(detectPaymentSourceFromDescription('Visa Platinum *** 1234')).toBe('visa_platinum');
  });

  it('detektira Mastercard Gold prije generičkog Mastercard', () => {
    expect(detectPaymentSourceFromDescription('Mastercard Gold')).toBe('mastercard_gold');
  });

  it('detektira KeksPay kao visa_kekspay', () => {
    expect(detectPaymentSourceFromDescription('KeksPay uplata')).toBe('visa_kekspay');
  });

  it('detektira Maestro karticu', () => {
    expect(detectPaymentSourceFromDescription('Maestro **** 9999')).toBe('maestro');
  });

  it('detektira gotovinu/bankomat', () => {
    expect(detectPaymentSourceFromDescription('Podizanje gotovine bankomat')).toBe('cash');
  });

  it('vraća defaultSource kad nema podudaranja', () => {
    expect(detectPaymentSourceFromDescription('Nepoznato', 'revolut')).toBe('revolut');
  });

  it('Visa s Aircash kontekstom ne ide u "visa"', () => {
    // 'visa' bi se inače uhvatio, ali grana sa !desc.includes('aircash')
    expect(detectPaymentSourceFromDescription('Aircash Visa transfer')).toBe('aircash');
  });
});

describe('extractCardInfo', () => {
  it('izvlači Visa + last4 iz "Visa *** 7262"', () => {
    expect(extractCardInfo('Visa *** 7262')).toEqual({ cardType: 'Visa', last4: '7262' });
  });

  it('izvlači Mastercard + last4', () => {
    expect(extractCardInfo('Mastercard ****1234')).toEqual({ cardType: 'Mastercard', last4: '1234' });
  });

  it('izvlači Maestro + last4', () => {
    expect(extractCardInfo('Maestro * 9876')).toEqual({ cardType: 'Maestro', last4: '9876' });
  });

  it('vraća null/null kad nema kartice', () => {
    expect(extractCardInfo('Konzum kupovina')).toEqual({ cardType: null, last4: null });
  });

  it('handlea generic *** pattern bez branda', () => {
    const result = extractCardInfo('Plaćanje *** 4321');
    expect(result.last4).toBe('4321');
  });
});

describe('enrichDescription', () => {
  it('dodaje card info ako nije u opisu', () => {
    const out = enrichDescription('Plaćanje Visa 7262', 'PBZ', 'visa');
    expect(out).toContain('[Visa *7262]');
  });


  it('ne dodaje card info ako je već u opisu', () => {
    const out = enrichDescription('Visa *** 7262 Konzum', 'PBZ', 'visa');
    expect(out).not.toMatch(/\[Visa \*7262\]$/);
  });

  it('dodaje bank source kad nije već spomenut', () => {
    const out = enrichDescription('Konzum Maksimirska', 'PBZ', 'bank');
    expect(out).toContain('[PBZ]');
  });

  it('ne duplicira bank source ako je u opisu', () => {
    const out = enrichDescription('PBZ prijenos', 'PBZ', 'bank');
    expect(out).not.toContain('[PBZ]');
  });
});

describe('detectCSVFormat', () => {
  it('detektira Revolut headere', () => {
    expect(detectCSVFormat(['Type', 'Completed Date', 'Description', 'Amount', 'Balance'])).toBe('revolut');
  });

  it('detektira Aircash headere', () => {
    expect(detectCSVFormat(['Datum', 'Opis transakcije', 'Iznos'])).toBe('aircash');
  });

  it('detektira PBZ headere', () => {
    expect(detectCSVFormat(['Datum valute', 'Opis', 'Iznos u valuti računa'])).toBe('pbz');
  });

  it('detektira Erste headere', () => {
    expect(detectCSVFormat(['Datum knjiženja', 'Opis plaćanja', 'Iznos'])).toBe('erste');
  });

  it('detektira ZABA headere', () => {
    expect(detectCSVFormat(['Datum izvršenja', 'Primatelj/platitelj', 'Iznos'])).toBe('zaba');
  });

  it('vraća "generic" za standardne EN headere', () => {
    expect(detectCSVFormat(['Date', 'Amount', 'Description'])).toBe('generic');
  });

  it('vraća "unknown" za nepoznate headere', () => {
    expect(detectCSVFormat(['Foo', 'Bar', 'Baz'])).toBe('unknown');
  });
});

describe('parseCSVString', () => {
  it('parsira osnovni CSV s zarezima', () => {
    const rows = parseCSVString('a,b,c\n1,2,3');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('parsira CSV s točka-zarezima', () => {
    const rows = parseCSVString('a;b;c\n1;2;3');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('respektira navodnike s zarezima unutra', () => {
    const rows = parseCSVString('"Konzum, Maksimirska",100,EUR');
    expect(rows[0]).toEqual(['Konzum, Maksimirska', '100', 'EUR']);
  });

  it('preskače prazne linije', () => {
    const rows = parseCSVString('a,b\n\n1,2\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handlea CRLF line endings', () => {
    const rows = parseCSVString('a,b\r\n1,2');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('categorizeTransaction', () => {
  it('kategorizira hranu i trgovine', () => {
    expect(categorizeTransaction('Konzum Maksimirska')).toBe('food');
    expect(categorizeTransaction('Lidl Zagreb')).toBe('food');
    expect(categorizeTransaction('Wolt order')).toBe('food');
  });

  it('kategorizira transport i gorivo', () => {
    expect(categorizeTransaction('INA Velika Gorica')).toBe('transport');
    expect(categorizeTransaction('Bolt Ride')).toBe('transport');
    expect(categorizeTransaction('HAK cestarina')).toBe('transport');
  });

  it('kategorizira shopping', () => {
    expect(categorizeTransaction('Zara online')).toBe('shopping');
    expect(categorizeTransaction('Amazon EU')).toBe('shopping');
  });

  it('kategorizira entertainment/subscriptions', () => {
    expect(categorizeTransaction('Netflix Subscription')).toBe('entertainment');
    expect(categorizeTransaction('Spotify Premium')).toBe('entertainment');
  });

  it('kategorizira režije', () => {
    expect(categorizeTransaction('HEP račun')).toBe('bills');
    expect(categorizeTransaction('A1 mobitel')).toBe('bills');
    expect(categorizeTransaction('Najam stana')).toBe('bills');
  });

  it('kategorizira zdravlje', () => {
    expect(categorizeTransaction('Ljekarna Vrapče')).toBe('health');
    expect(categorizeTransaction('Zubar Dr. Horvat')).toBe('health');
  });

  it('vraća "other" za nepoznatu transakciju', () => {
    expect(categorizeTransaction('Totalno random opis xyz')).toBe('other');
  });
});
