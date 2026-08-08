/**
 * MAIL UVOZ — čuvari cjevovoda (korak 2).
 *
 * Ovi testovi štite pravila koja se NE smiju regresirati:
 * hijerarhija bez AI-a, karantena, XXE, HTML bez mreže, dedup, trust, IBAN.
 */

import { describe, it, expect, vi } from 'vitest';

import { evaluateMime, sniffMime } from '../../supabase/functions/_shared/mailImport/mimeSniff.ts';
import { inspectXml, assertXmlSafe } from '../../supabase/functions/_shared/mailImport/xmlSafety.ts';
import {
  htmlToText,
  extractLinks,
  containsNetworkResource,
} from '../../supabase/functions/_shared/mailImport/htmlToText.ts';
import { evaluatePdfPages, MAX_PDF_PAGES } from '../../supabase/functions/_shared/mailImport/pdfPages.ts';
import { evaluateTrust, isAuthenticatedGoogle } from '../../supabase/functions/_shared/mailImport/trustLevel.ts';
import { checkIbanAgainstHistory } from '../../supabase/functions/_shared/mailImport/ibanCheck.ts';
import { evaluateDam } from '../../supabase/functions/_shared/mailImport/rateLimit.ts';
import {
  classifyDocument,
  lowerConfidence,
} from '../../supabase/functions/_shared/mailImport/classify.ts';
import { detectGmailVerification } from '../../supabase/functions/_shared/mailImport/gmailVerification.ts';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('MIME njuškanje', () => {
  it('prepoznaje PDF, PNG, JPG i XML po bajtovima', () => {
    expect(sniffMime(ascii('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(sniffMime(ascii('<?xml version="1.0"?><Invoice/>'))).toBe('xml');
  });

  it('nesklad deklaracije i bajtova je signal, ne presuda', () => {
    const verdict = evaluateMime(ascii('%PDF-1.4'), 'image/png');
    expect(verdict.sniffed).toBe('pdf');
    expect(verdict.mismatch).toBe(true);
    expect(verdict.allowed).toBe(true);
  });

  it('nepodržan tip ide u karantenu s razlogom', () => {
    const verdict = evaluateMime(ascii('MZ\x90\x00'), 'application/pdf');
    expect(verdict.allowed).toBe(false);
    expect(verdict.quarantineReason).toBe('nepodrzan_tip');
  });

  it('ZIP arhiva nije dopuštena', () => {
    const verdict = evaluateMime(bytes(0x50, 0x4b, 0x03, 0x04), 'application/zip');
    expect(verdict.sniffed).toBe('zip');
    expect(verdict.allowed).toBe(false);
    expect(verdict.quarantineReason).toBe('arhiva_nije_podrzana');
  });
});

describe('XML sigurnost', () => {
  it('DTD i vanjski entiteti se ne razrješavaju — dokument se odbija', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<Invoice><ID>&xxe;</ID></Invoice>`;
    const verdict = inspectXml(xxe);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toBe('doctype_nije_dopusten');
    expect(() => assertXmlSafe(xxe)).toThrow(/xml_unsafe/);
  });

  it('billion laughs (entiteti bez DOCTYPE u komentaru) se ne provlači', () => {
    const bomb = `<!-- bezopasno --><!ENTITY lol "lololol"><Invoice/>`;
    expect(inspectXml(bomb).safe).toBe(false);
  });

  it('čist UBL prolazi', () => {
    expect(inspectXml('<?xml version="1.0"?><Invoice><ID>1</ID></Invoice>').safe).toBe(true);
  });
});

describe('HTML tijelo bez ijednog mrežnog dohvata', () => {
  const html = `
    <html><head><style>body{background:url(http://zlo.example/x.png)}</style>
    <script src="http://zlo.example/x.js"></script></head>
    <body><img src="http://tracker.example/pixel.gif">
    <p>Račun broj 123</p><iframe src="http://zlo.example"></iframe>
    <a href="https://dobavljac.example/racun">Pregled</a></body></html>`;

  it('uklanja svaki element koji bi pozvao mrežu', () => {
    const text = htmlToText(html);
    expect(containsNetworkResource(text)).toBe(false);
    expect(text).not.toMatch(/tracker\.example/);
    expect(text).not.toMatch(/<script|<img|<iframe|<style/i);
    expect(text).toContain('Račun broj 123');
  });

  it('linkovi se izvlače samo kao podaci', () => {
    expect(extractLinks(html)).toContain('https://dobavljac.example/racun');
  });
});

describe('PDF granica stranica', () => {
  it('preko granice obrađuje prvih 30 i tvrdo obara pouzdanost', () => {
    const pdf = ascii(`%PDF-1.4\n1 0 obj<</Type /Pages /Count 42>>endobj`);
    const verdict = evaluatePdfPages(pdf);
    expect(verdict.pageCount).toBe(42);
    expect(verdict.pagesToProcess).toBe(MAX_PDF_PAGES);
    expect(verdict.incomplete).toBe(true);
    expect(verdict.forcedConfidence).toBe('niska');
    expect(lowerConfidence('visoka', verdict.forcedConfidence)).toBe('niska');
  });

  it('unutar granice je potpun', () => {
    const pdf = ascii(`%PDF-1.4\n1 0 obj<</Type /Pages /Count 3>>endobj`);
    expect(evaluatePdfPages(pdf).incomplete).toBe(false);
  });
});

describe('Razina povjerenja', () => {
  it('T1 traži usklađenost s From domenom, ne samo prolaz', () => {
    const aligned = evaluateTrust({
      dkim: 'pass header.d=dobavljac.hr',
      spf: 'fail',
      fromHeader: 'Ured <racuni@dobavljac.hr>',
    });
    expect(aligned.level).toBe('T1');

    const unaligned = evaluateTrust({
      spf: 'pass domain=napadac.example',
      dkim: 'none',
      fromHeader: 'Ured <racuni@dobavljac.hr>',
    });
    expect(unaligned.level).not.toBe('T1');
  });

  it('T2 traži pouzdanog ARC sealera I uredan izvorni rezultat', () => {
    const t2 = evaluateTrust({
      arc: 'pass header.d=google.com',
      fromHeader: 'x@dobavljac.hr',
      originalAuthResults: 'dkim=pass header.d=dobavljac.hr',
    });
    expect(t2.level).toBe('T2');

    const noOriginal = evaluateTrust({
      arc: 'pass header.d=google.com',
      fromHeader: 'x@dobavljac.hr',
    });
    expect(noOriginal.level).toBe('T3');
  });

  it('T4 tvrdo obara pouzdanost i isključuje iz grupnih radnji', () => {
    const t4 = evaluateTrust({ fromHeader: 'x@nepoznato.example' });
    expect(t4.level).toBe('T4');
    expect(t4.forcedConfidence).toBe('niska');
    expect(t4.excludedFromBulk).toBe(true);
    expect(t4.warnings).toContain('posiljatelj_neprovjeren');
  });

  it('Google se priznaje samo uz usklađen prolaz', () => {
    expect(
      isAuthenticatedGoogle({
        dkim: 'pass header.d=google.com',
        fromHeader: 'forwarding-noreply@google.com',
      }),
    ).toBe(true);
    expect(
      isAuthenticatedGoogle({ dkim: 'none', fromHeader: 'forwarding-noreply@google.com' }),
    ).toBe(false);
  });
});

describe('IBAN protiv povijesti — tvrdo upozorenje', () => {
  it('nepoznat IBAN za poznat OIB diže upozorenje', () => {
    const res = checkIbanAgainstHistory('HR12 1001 0051 8630 0016 0', ['HR9923600001101234565']);
    expect(res.mismatch).toBe(true);
    expect(res.warnings).toContain('iban_ne_odgovara_povijesti');
  });

  it('poznat IBAN (bez razmaka) prolazi', () => {
    const res = checkIbanAgainstHistory('hr99 2360 0001 1012 3456 5', ['HR9923600001101234565']);
    expect(res.mismatch).toBe(false);
    expect(res.warnings).toEqual([]);
  });

  it('prvi viđeni IBAN nije greška, ali se bilježi', () => {
    const res = checkIbanAgainstHistory('HR9923600001101234565', []);
    expect(res.firstSeen).toBe(true);
    expect(res.mismatch).toBe(false);
  });
});

describe('Brane na prijemu', () => {
  it('iznad granice po satu posao ne ulazi u red', () => {
    expect(evaluateDam({ lastHour: 30, lastDay: 40 })).toEqual({
      enqueue: false,
      reason: 'brana_sat',
    });
  });
  it('iznad dnevne granice posao ne ulazi u red', () => {
    expect(evaluateDam({ lastHour: 2, lastDay: 100 })).toEqual({
      enqueue: false,
      reason: 'brana_dan',
    });
  });
  it('ispod granica posao ide u red', () => {
    expect(evaluateDam({ lastHour: 1, lastDay: 5 }).enqueue).toBe(true);
  });
});

describe('Hijerarhija klasifikacije — ČUVAR AI poziva', () => {
  const parseUbl = vi.fn(() => ({ invoiceTypeCode: '381', supplier_oib: '12345678901' }));

  it('UBL privitak: nula AI poziva (≥1 poziv = kvar)', async () => {
    const analyzeWithAi = vi.fn();
    const result = await classifyDocument(
      { sniffed: 'xml', xml: '<?xml version="1.0"?><Invoice><ID>1</ID></Invoice>' },
      { parseUbl, analyzeWithAi },
    );
    expect(analyzeWithAi).not.toHaveBeenCalled();
    expect(result.aiCalls).toBe(0);
    expect(result.route).toBe('ubl');
    expect(result.classification).toBe('racun');
    expect(result.docType).toBe('381');
  });

  it('Gmail verifikacija: bez AI-a, bez kvote, prioritet', async () => {
    const analyzeWithAi = vi.fn();
    const result = await classifyDocument(
      {
        sniffed: 'unknown',
        fromHeader: 'Gmail Team <forwarding-noreply@google.com>',
        subject: '(#123456789) Gmail Forwarding Confirmation - Receive Mail from ime@vmbalance.com',
        bodyText: 'Potvrdite prosljeđivanje.',
        links: ['https://mail-settings.google.com/mail/vf-abc'],
        googleAuthenticated: true,
      },
      { parseUbl, analyzeWithAi },
    );
    expect(analyzeWithAi).not.toHaveBeenCalled();
    expect(result.classification).toBe('verifikacija_prosljedjivanja');
    expect(result.consumesQuota).toBe(false);
    expect(result.priority).toBe(true);
    expect(result.extraction?.code).toBe('123456789');
    expect(result.extraction?.confirmUrl).toBe('https://mail-settings.google.com/mail/vf-abc');
  });

  it('heuristika: poznat OIB odlučuje bez AI-a', async () => {
    const analyzeWithAi = vi.fn();
    const result = await classifyDocument(
      { sniffed: 'pdf', bodyText: 'OIB 12345678901, račun 5/1/1', knownOibs: ['12345678901'] },
      { parseUbl, analyzeWithAi },
    );
    expect(analyzeWithAi).not.toHaveBeenCalled();
    expect(result.route).toBe('heuristika');
    expect(result.aiCalls).toBe(0);
  });

  it('AI tek kad ništa gore nije odlučilo, i to jednom', async () => {
    const analyzeWithAi = vi.fn(async () => ({
      classification: 'racun' as const,
      extraction: { supplier_oib: '99999999999' },
      confidence: 'srednja' as const,
    }));
    const result = await classifyDocument(
      { sniffed: 'pdf', bodyText: 'nepoznat dobavljač' },
      { parseUbl, analyzeWithAi },
    );
    expect(analyzeWithAi).toHaveBeenCalledTimes(1);
    expect(result.aiCalls).toBe(1);
    expect(result.route).toBe('ai');
  });

  it('AI kaže da nije račun ni ponuda → nije_za_nas, ništa se ne izvlači', async () => {
    const result = await classifyDocument(
      { sniffed: 'pdf', bodyText: 'newsletter' },
      {
        parseUbl,
        analyzeWithAi: async () => ({
          classification: 'nije_za_nas' as const,
          extraction: { supplier_oib: 'x' },
          confidence: 'visoka' as const,
        }),
      },
    );
    expect(result.classification).toBe('nije_za_nas');
    expect(result.extraction).toBeNull();
  });

  it('bez dostupnog AI-a stavka ostaje nepoznata i NE troši kvotu', async () => {
    const result = await classifyDocument({ sniffed: 'pdf', bodyText: 'x' }, { parseUbl });
    expect(result.route).toBe('nepoznato');
    expect(result.consumesQuota).toBe(false);
    expect(result.aiCalls).toBe(0);
  });
});

describe('Gmail verifikacija — sigurnost linka', () => {
  const base = {
    fromHeader: 'forwarding-noreply@google.com',
    subject: '(#987654321) Gmail Forwarding Confirmation',
    bodyText: '',
  };

  it('podmetnuta domena NE postaje gumb', () => {
    const res = detectGmailVerification({
      ...base,
      links: ['https://mail-settings.google.com.zlo.example/mail/vf-abc'],
      googleAuthenticated: true,
    });
    expect(res.safeConfirmUrl).toBeNull();
    expect(res.linkWithheld).toBe(true);
    expect(res.code).toBe('987654321');
  });

  it('neautenticirana poruka daje samo kod, uz upozorenje', () => {
    const res = detectGmailVerification({
      ...base,
      links: ['https://mail-settings.google.com/mail/vf-abc'],
      googleAuthenticated: false,
    });
    expect(res.safeConfirmUrl).toBeNull();
    expect(res.warnings).toContain('verifikacija_nije_autenticirana');
  });
});
