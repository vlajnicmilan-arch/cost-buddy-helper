/**
 * MAIL UVOZ — čuvari ekstrakcije (nalog #3).
 *
 * Štite: ISO 7064 OIB, mod-97 IBAN, isključenje kupčevog (našeg) OIB-a,
 * '' → NULL na izlazu iz AI-ja, plosnato UBL mapiranje i "tekst prije skupog":
 * PDF s tekstualnim slojem NIKAD ne smije ići multimodalno.
 */

import { describe, it, expect } from 'vitest';

import {
  isValidOib,
  findValidOibs,
  pickSupplierOib,
  normalizeOib,
} from '../../supabase/functions/_shared/mailImport/oib.ts';
import {
  isValidIban,
  findValidIbans,
} from '../../supabase/functions/_shared/mailImport/ibanCheck.ts';
import {
  deterministicExtract,
  findDueDate,
} from '../../supabase/functions/_shared/mailImport/deterministicExtract.ts';
import {
  emptyToNull,
  flattenUblExtraction,
  mergeDeterministic,
} from '../../supabase/functions/_shared/mailImport/extractionNormalize.ts';
import { buildAiRequest } from '../../supabase/functions/_shared/mailImport/aiRequest.ts';
import { hasTextLayer, joinPdfPages, MAX_TEXT_PAGES } from '../../supabase/functions/_shared/mailImport/pdfTextRules.ts';
import { classifyDocument } from '../../supabase/functions/_shared/mailImport/classify.ts';

// Poznati valjani OIB-i (kontrolna znamenka po ISO 7064 MOD 11,10).
const VALID_A = '12345678903';
const VALID_B = '69435151530';

describe('OIB — ISO 7064 MOD 11,10', () => {
  it('prihvaća valjane OIB-e', () => {
    expect(isValidOib(VALID_A)).toBe(true);
    expect(isValidOib(VALID_B)).toBe(true);
  });

  it('odbija krivu kontrolnu znamenku', () => {
    expect(isValidOib('12345678901')).toBe(false);
    expect(isValidOib('69435151531')).toBe(false);
  });

  it('rubni slučajevi: duljina, slova, prazno', () => {
    expect(isValidOib('')).toBe(false);
    expect(isValidOib(null)).toBe(false);
    expect(isValidOib(undefined)).toBe(false);
    expect(isValidOib('1234567890')).toBe(false);
    expect(isValidOib('123456789031')).toBe(false);
    expect(isValidOib('1234567890A')).toBe(false);
    expect(isValidOib('00000000000')).toBe(false);
  });

  it('normalizira prefiks HR i razmake', () => {
    expect(normalizeOib(`HR${VALID_A}`)).toBe(VALID_A);
    expect(normalizeOib('HR12345678901')).toBeNull();
  });

  it('iz teksta vadi samo valjane kandidate', () => {
    const text = `Broj računa 12345678901, OIB izdavatelja ${VALID_A}`;
    expect(findValidOibs(text)).toEqual([VALID_A]);
  });
});

describe('Isključenje kupčevog OIB-a', () => {
  it('tekst s dva OIB-a bira TUĐI, ne naš', () => {
    const text = `Izdavatelj OIB: ${VALID_A}\nKupac OIB: ${VALID_B}`;
    const pick = pickSupplierOib(text, [VALID_B]);
    expect(pick.oib).toBe(VALID_A);
    expect(pick.ambiguous).toBe(false);
  });

  it('dva TUĐA OIB-a = prazno + višeznačnost (pregled odlučuje)', () => {
    const text = `${VALID_A} i ${VALID_B}`;
    const pick = pickSupplierOib(text, []);
    expect(pick.oib).toBeNull();
    expect(pick.ambiguous).toBe(true);
  });

  it('samo naš OIB = nema dobavljača', () => {
    expect(pickSupplierOib(`OIB ${VALID_A}`, [VALID_A]).oib).toBeNull();
  });
});

describe('IBAN — mod-97', () => {
  it('prihvaća valjan, odbija pokvaren', () => {
    expect(isValidIban('HR1210010051863000160')).toBe(true);
    expect(isValidIban('HR1210010051863000161')).toBe(false);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('')).toBe(false);
  });

  it('vadi IBAN iz teksta s razmacima', () => {
    const found = findValidIbans('Uplata na HR12 1001 0051 8630 0016 0 hvala');
    expect(found).toContain('HR1210010051863000160');
  });
});

describe('Datum dospijeća — samo nedvosmislen', () => {
  it('čita datum iz retka s ključnom riječi', () => {
    expect(findDueDate('Datum izdavanja: 01.08.2026.\nRok plaćanja: 15.08.2026.').dueDate)
      .toBe('2026-08-15');
  });

  it('bez ključne riječi ostaje prazno', () => {
    expect(findDueDate('01.08.2026.').dueDate).toBeNull();
  });

  it('dva različita dospijeća = prazno + višeznačnost', () => {
    const r = findDueDate('Dospijeće: 15.08.2026.\nRok plaćanja: 20.08.2026.');
    expect(r.dueDate).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
});

describe('Deterministički ulov', () => {
  it('spaja OIB, IBAN i dospijeće bez ijednog AI poziva', () => {
    const text = [
      `Izdavatelj OIB: ${VALID_A}`,
      `Kupac OIB: ${VALID_B}`,
      'IBAN: HR1210010051863000160',
      'Rok plaćanja: 15.08.2026.',
    ].join('\n');

    const result = deterministicExtract({ text, ownOibs: [VALID_B] });
    expect(result.supplier_oib).toBe(VALID_A);
    expect(result.iban).toBe('HR1210010051863000160');
    expect(result.due_date).toBe('2026-08-15');
    expect(result.ambiguous).toBe(false);
  });
});

describe("Higijena: '' → NULL", () => {
  it('prazni stringovi postaju null, ugniježđeno također', () => {
    const out = emptyToNull({ a: '', b: '  ', c: 'x', d: { e: '' }, f: 0 });
    expect(out.a).toBeNull();
    expect(out.b).toBeNull();
    expect(out.c).toBe('x');
    expect((out.d as Record<string, unknown>).e).toBeNull();
    expect(out.f).toBe(0);
  });

  it('determinizam pobjeđuje AI nagađanje', () => {
    const merged = mergeDeterministic(
      { supplier_oib: '', iban: '00000000000000000000' },
      { supplier_oib: VALID_A, iban: 'HR1210010051863000160', due_date: null },
    );
    expect(merged.supplier_oib).toBe(VALID_A);
    expect(merged.iban).toBe('HR1210010051863000160');
    expect(merged.due_date).toBeNull();
  });
});

describe('UBL — plosnato mapiranje', () => {
  const ublParsed = {
    invoiceNumber: '2026-001',
    issueDate: '2026-08-01',
    dueDate: '2026-08-15',
    currency: 'EUR',
    supplier: { oib: VALID_A, name: 'Dobavljač d.o.o.' },
    customer: { oib: VALID_B, name: 'Mi d.o.o.' },
    iban: 'HR1210010051863000160',
    payableAmount: 125.5,
    taxAmount: 25.1,
    lines: [],
  };

  it('daje ključeve koje čitaju mail_item_confirm i UI', () => {
    const flat = flattenUblExtraction(ublParsed);
    expect(flat.supplier_oib).toBe(VALID_A);
    expect(flat.supplier_name).toBe('Dobavljač d.o.o.');
    expect(flat.invoice_number).toBe('2026-001');
    expect(flat.total_amount).toBe(125.5);
    expect(flat.due_date).toBe('2026-08-15');
    expect(flat.iban).toBe('HR1210010051863000160');
  });

  it('UBL stavka kroz klasifikaciju ima popunjen supplier_oib i 0 AI poziva', async () => {
    const result = await classifyDocument(
      { sniffed: 'xml', xml: '<Invoice/>' },
      { parseUbl: () => ublParsed, analyzeWithAi: async () => { throw new Error('AI ne smije'); } },
    );
    expect(result.route).toBe('ubl');
    expect(result.aiCalls).toBe(0);
    expect((result.extraction ?? {}).supplier_oib).toBe(VALID_A);
  });
});

describe('Tekst prije skupog', () => {
  it('PDF s tekstualnim slojem → nula multimodalnih blokova', () => {
    const plan = buildAiRequest({
      subject: 'Račun',
      bodyText: 'U privitku',
      pdfText: 'RAČUN br. 2026-001, OIB 12345678903, ukupno 125,50 EUR',
      pdfBase64: 'JVBERi0xLjc=',
    });
    expect(plan.multimodal).toBe(false);
    expect(plan.content.filter((b) => b.type === 'file')).toHaveLength(0);
    expect(plan.content[0].type).toBe('text');
  });

  it('sken bez tekstualnog sloja → jedan file blok', () => {
    const plan = buildAiRequest({ pdfText: '', pdfBase64: 'JVBERi0xLjc=' });
    expect(plan.multimodal).toBe(true);
    expect(plan.content.filter((b) => b.type === 'file')).toHaveLength(1);
  });

  it('bez PDF-a nema file bloka', () => {
    expect(buildAiRequest({ bodyText: 'samo tekst' }).multimodal).toBe(false);
  });

  it('prompt traži null, ne prazan string', () => {
    const plan = buildAiRequest({ bodyText: 'x' });
    const text = (plan.content[0] as { text: string }).text;
    expect(text).toContain('null');
    expect(text).toContain('NIKAD ne vraćaj prazan string');
  });
});

describe('PDF tekstualni sloj — pravila', () => {
  it('čita najviše 10 stranica', () => {
    const pages = Array.from({ length: 20 }, (_, i) => `stranica ${i}`);
    expect(joinPdfPages(pages).split('\n')).toHaveLength(MAX_TEXT_PAGES);
  });

  it('šum skenera nije tekstualni sloj', () => {
    expect(hasTextLayer('')).toBe(false);
    expect(hasTextLayer('  \n ')).toBe(false);
    expect(hasTextLayer('RAČUN broj 2026-001 izdan dana 01.08.2026 ukupno')).toBe(true);
  });
});
