import { describe, expect, it } from 'vitest';
import {
  classifyDocument,
  type ClassifyInput,
} from '../../supabase/functions/_shared/mailImport/classify.ts';
import { loadMailFixture, loadPdfFixture, OWN_OIBS } from './mailClassifyFixtures';

/**
 * Živi kvar (rujan 2026): vlastiti OIB 39916265994 stoji u `incoming_invoices`
 * kao dobavljač, pa je svaki mail s potpisom „Akrobat … OIB" prolazio kao
 * „poznat izdavatelj" → `racun`, a AI presuda (`ponuda`/`nije_za_nas`) se bacala.
 */

type Verdict = 'racun' | 'ponuda' | 'nije_za_nas';
const ai = (classification: Verdict, extraction: Record<string, unknown> = {}) => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return { classification, extraction, confidence: 'visoka' as const };
  };
  return { fn, calls: () => calls };
};

// Vlastiti OIB namjerno u poznatima — tako izgleda živa baza.
const KNOWN = ['39916265994', '85821130368', '23057039320'];

const base = (id: string, extra: Partial<ClassifyInput> = {}): ClassifyInput => {
  const m = loadMailFixture(id);
  return {
    sniffed: 'unknown',
    subject: m.subject,
    fromHeader: m.from,
    bodyText: m.body,
    knownOibs: KNOWN,
    ownOibs: OWN_OIBS,
    ...extra,
  };
};

describe('poznat OIB je dokaz izdavatelja, ne presuda', () => {
  it('340f858b OTP Leasing: AI „ponuda" ostaje ponuda, dobavljač nije vlastiti OIB', async () => {
    const stub = ai('ponuda', { supplier_name: 'OTP Leasing d.d.', supplier_oib: '39916265994' });
    const r = await classifyDocument(
      base('340f858b', { sniffed: 'pdf', pdfText: loadPdfFixture('340f858b') }),
      { parseUbl: () => ({}), analyzeWithAi: stub.fn },
    );
    expect(r.classification).toBe('ponuda');
    expect(r.extraction?.supplier_oib ?? null).toBeNull();
    expect(r.warnings).toContain('vlastiti_oib_nije_dobavljac');
  });

  it('cc7d46c6 FINA dopis: AI „nije_za_nas" vrijedi', async () => {
    const stub = ai('nije_za_nas');
    const r = await classifyDocument(base('cc7d46c6'), { parseUbl: () => ({}), analyzeWithAi: stub.fn });
    expect(r.classification).toBe('nije_za_nas');
    expect(r.aiCalls).toBe(1);
  });

  it('jeftini prolaz bez AI-ja: vlastiti OIB ne pokreće heuristiku', async () => {
    const r = await classifyDocument(
      base('340f858b', { sniffed: 'pdf', pdfText: loadPdfFixture('340f858b') }),
      { parseUbl: () => ({}) },
    );
    expect(r.route).toBe('nepoznato');
    expect(r.classification).not.toBe('racun');
  });

  it('pravi račun poznatog dobavljača ostaje račun bez AI-ja', async () => {
    const text = `GRAD OSIJEK
OIB: 85821130368
Račun br. 2026-114
Datum dospijeća: 25.08.2026.
Iznos za uplatu: 41,20 EUR
IBAN: HR1723600001101234565`;
    const r = await classifyDocument(
      { sniffed: 'pdf', pdfText: text, subject: 'Račun', knownOibs: KNOWN, ownOibs: OWN_OIBS },
      { parseUbl: () => ({}) },
    );
    expect(r.classification).toBe('racun');
    expect(r.route).toBe('heuristika');
    expect(r.extraction?.supplier_oib).toBe('85821130368');
  });

  it('dopuna s AI presudom „nije_za_nas" ne gazi — ni kad je izdavatelj poznat', async () => {
    const text = `FINA OIB 85821130368
Račun br. obrazac punomoći — nije dokument za plaćanje`;
    const stub = ai('nije_za_nas');
    const r = await classifyDocument(
      { sniffed: 'pdf', pdfText: text, subject: 'FW: Obrazac', knownOibs: KNOWN, ownOibs: OWN_OIBS },
      { parseUbl: () => ({}), analyzeWithAi: stub.fn },
    );
    expect(r.classification).toBe('nije_za_nas');
    expect(stub.calls()).toBe(1);
  });

  it('AI ne smije upisati vlastiti OIB kao dobavljača ni kod računa', async () => {
    const stub = ai('racun', { supplier_oib: '33941873288', total_amount: 10 });
    const r = await classifyDocument(
      { sniffed: 'unknown', bodyText: 'Hvala na kupnji, ukupno 10,00 EUR', subject: 'Receipt', ownOibs: OWN_OIBS },
      { parseUbl: () => ({}), analyzeWithAi: stub.fn },
    );
    expect(r.classification).toBe('racun');
    expect(r.extraction?.supplier_oib ?? null).toBeNull();
  });
});
