/**
 * ČUVAR TROŠKA — pametna dopuna (nalog #5).
 *
 * Dopuna smije potrošiti AI poziv SAMO kad je jeftina grana odlučila što je
 * dokument, ali su ključna polja ostala prazna I postoji tekst. Potpuna stavka
 * i UBL privitak nikad ne troše ni jedan poziv.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  classifyDocument,
  needsAiEnrichment,
  hasExtractableText,
  type ClassifyInput,
} from '../../supabase/functions/_shared/mailImport/classify.ts';

const parseUbl = () => ({
  supplier: { oib: '12345678903', name: 'ACME' },
  invoiceNumber: '1-1-1',
  payableAmount: 100,
});

const baseInput = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  sniffed: 'pdf',
  fromHeader: 'racuni@acme.hr',
  subject: 'Račun',
  bodyText: 'Ukupno za platiti 100,00 EUR',
  knownOibs: ['12345678903'],
  searchText: '12345678903',
  ...over,
});

describe('needsAiEnrichment', () => {
  it('bez teksta nikad ne traži dopunu', () => {
    expect(needsAiEnrichment({ total_amount: null }, false)).toBe(false);
  });

  it('potpuna polja ne traže dopunu', () => {
    expect(
      needsAiEnrichment(
        { total_amount: 100, invoice_number: '1', supplier_name: 'ACME' },
        true,
      ),
    ).toBe(false);
  });

  it('prazan iznos traži dopunu', () => {
    expect(needsAiEnrichment({ invoice_number: '1', supplier_name: 'ACME' }, true)).toBe(true);
  });

  it('hasExtractableText prepoznaje tijelo i PDF tekst', () => {
    expect(hasExtractableText(baseInput({ bodyText: '', pdfText: 'tekst' }))).toBe(true);
    expect(hasExtractableText(baseInput({ bodyText: '', pdfText: '' }))).toBe(false);
  });
});

describe('classifyDocument — dopuna', () => {
  it('UBL ne troši AI poziv', async () => {
    const ai = vi.fn();
    const res = await classifyDocument(
      baseInput({ sniffed: 'xml', xml: '<Invoice/>' }),
      { parseUbl, analyzeWithAi: ai },
    );
    expect(res.route).toBe('ubl');
    expect(res.aiCalls).toBe(0);
    expect(ai).not.toHaveBeenCalled();
  });

  it('heuristika s rupama poziva AI i puni prazna polja', async () => {
    const ai = vi.fn().mockResolvedValue({
      classification: 'racun',
      extraction: { total_amount: 100, invoice_number: '77', supplier_name: 'ACME d.o.o.' },
      confidence: 'srednja',
    });
    const res = await classifyDocument(baseInput(), { parseUbl, analyzeWithAi: ai });
    expect(res.route).toBe('heuristika');
    expect(res.aiCalls).toBe(1);
    expect(res.extraction?.total_amount).toBe(100);
    expect(res.extraction?.supplier_name).toBe('ACME d.o.o.');
    // Determinizam ostaje netaknut: poznati OIB nije pregažen.
    expect(res.extraction?.supplier_oib).toBe('12345678903');
    expect(res.warnings).toContain('ai_dopuna');
  });

  it('heuristika bez teksta ne poziva AI', async () => {
    const ai = vi.fn();
    const res = await classifyDocument(
      baseInput({ bodyText: '', pdfText: '' }),
      { parseUbl, analyzeWithAi: ai },
    );
    expect(res.route).toBe('heuristika');
    expect(res.aiCalls).toBe(0);
    expect(ai).not.toHaveBeenCalled();
  });
});
