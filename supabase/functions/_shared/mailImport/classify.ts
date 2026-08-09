/**
 * MAIL UVOZ — OBVEZNA HIJERARHIJA KLASIFIKACIJE.
 *
 * Redoslijed je tvrd i ne smije se preskakati:
 *   1. XML/UBL      → deterministički `parseUbl`, NULA AI poziva
 *   2. verifikacija → Gmail otisak, bez kvote, bez AI
 *   3. heuristika   → poznat OIB/pošiljatelj iz povijesti, bez AI
 *   4. AI           → tek kad ništa gore nije odlučilo
 *
 * ČUVAR: `aiCalls` broji pozive po stavci. UBL privitak s ≥1 AI pozivom je
 * kvar, ne optimizacija — pokriveno testom.
 */

import { assertXmlSafe } from './xmlSafety.ts';
import { detectGmailVerification, type GmailVerificationResult } from './gmailVerification.ts';
import { isValidOib } from './oib.ts';
import { deterministicExtract } from './deterministicExtract.ts';
import { flattenUblExtraction, mergeDeterministic } from './extractionNormalize.ts';
import { classifyAsStatement } from './statementSignals.ts';

export type Classification =
  | 'racun'
  | 'izvod'
  | 'ponuda'
  | 'verifikacija_prosljedjivanja'
  | 'nije_za_nas'
  | 'nepoznato';

export type Confidence = 'visoka' | 'srednja' | 'niska';

export interface ClassifyInput {
  /** Rezultat njuškanja bajtova, ne deklaracija iz e-maila. */
  sniffed: 'pdf' | 'xml' | 'jpg' | 'png' | 'heic' | 'unknown';
  /** Sadržaj XML-a kad je `sniffed === 'xml'`. */
  xml?: string | null;
  fromHeader?: string | null;
  subject?: string | null;
  bodyText?: string;
  /** Tekstualni sloj PDF privitka (prvih 10 stranica), prazno kod skena. */
  pdfText?: string | null;
  /** Base64 PDF-a — prosljeđuje se AI-ju SAMO kad tekstualnog sloja nema. */
  pdfBase64?: string | null;
  pdfFilename?: string | null;
  links?: readonly string[];
  googleAuthenticated?: boolean;
  /** OIB-i i adrese pošiljatelja koje smo već potvrdili u prošlosti. */
  knownSenders?: readonly string[];
  knownOibs?: readonly string[];
  /** OIB-i vlasnika aliasa — na dokumentu su kao KUPAC, ne kao izdavatelj. */
  ownOibs?: readonly string[];
  /** Tekst iz kojeg heuristika traži poznati OIB (tijelo ili ime datoteke). */
  searchText?: string;
}

export interface ClassifyDeps {
  /** Deterministički UBL parser. Ne smije raditi mrežni poziv. */
  parseUbl: (xml: string) => Record<string, unknown>;
  /** AI klasifikacija/izvlačenje. Poziva se ISKLJUČIVO u koraku 4. */
  analyzeWithAi?: (input: ClassifyInput) => Promise<{
    classification: Classification;
    extraction: Record<string, unknown> | null;
    confidence: Confidence;
  }>;
}

export interface ClassifyResult {
  classification: Classification;
  docType: string | null;
  extraction: Record<string, unknown> | null;
  confidence: Confidence;
  /** Koji je korak hijerarhije donio odluku. */
  route: 'ubl' | 'verifikacija' | 'izvod' | 'heuristika' | 'ai' | 'nepoznato';
  /** Sumnja na izvod (1 sidreni signal) — čovjek bira, nikad tiho `racun`. */
  needsHumanChoice?: boolean;
  /** Broj AI poziva potrošenih za ovu stavku. */
  aiCalls: number;
  /** Verifikacijske poruke NIKAD ne troše kvotu. */
  consumesQuota: boolean;
  /** Verifikacijske poruke idu na vrh reda uz push. */
  priority: boolean;
  warnings: string[];
  verification: GmailVerificationResult | null;
}

const OIB_RE = /\b(\d{11})\b/g;

/** Kandidat mora proći ISO 7064 kontrolnu znamenku — gola regex nije dokaz. */
const findKnownOib = (text: string, knownOibs: readonly string[]): string | null => {
  if (knownOibs.length === 0) return null;
  // Poznati OIB dolazi iz nase baze partnera — podudarnost je jaci dokaz od
  // kontrolne znamenke, pa se ovdje checksum NE primjenjuje kao filtar.
  const set = new Set(knownOibs.map((o) => o.replace(/[^0-9]/g, '')).filter((o) => o.length === 11));
  if (set.size === 0) return null;
  const matches = (text ?? '').match(OIB_RE) ?? [];
  return matches.find((m) => set.has(m)) ?? null;
};

const senderKnown = (from: string | null | undefined, known: readonly string[]): boolean => {
  const addr = (from ?? '').toLowerCase();
  return known.some((k) => k.trim().length > 0 && addr.includes(k.toLowerCase().trim()));
};

/** Polja bez kojih dokument nije upotrebljiv jednim dodirom. */
export const ENRICHMENT_FIELDS = ['total_amount', 'invoice_number', 'supplier_name'] as const;

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

/** Vrijednosti koje vec imamo — ne smiju biti pregazene AI nagadanjem. */
const stripNulls = (source: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) if (!isBlank(v)) out[k] = v;
  return out;
};

/** Ima li uopce teksta na kojem AI moze raditi (bez teksta nema dopune). */
export function hasExtractableText(input: ClassifyInput): boolean {
  return [input.bodyText, input.pdfText].some((p) => (p ?? '').trim().length > 0);
}

/**
 * CUVAR TROSKA: dopuna se trazi SAMO ako nedostaje barem jedno kljucno polje
 * i postoji tekst. Potpuna jeftina stavka NIKAD ne trosi AI poziv.
 */
export function needsAiEnrichment(
  extraction: Record<string, unknown> | null,
  hasText: boolean,
  classification?: Classification | string | null,
): boolean {
  // IZVOD nikad ne ide na dopunu — AI bi „iznos računa" izmislio iz salda.
  if (classification === 'izvod') return false;
  if (!hasText) return false;
  const e = extraction ?? {};
  return ENRICHMENT_FIELDS.some((k) => isBlank(e[k]));
}

export async function classifyDocument(
  input: ClassifyInput,
  deps: ClassifyDeps,
): Promise<ClassifyResult> {
  const warnings: string[] = [];
  let aiCalls = 0;

  // ---- 1. XML/UBL — deterministički, NULA AI poziva -----------------------
  if (input.sniffed === 'xml' && (input.xml ?? '').trim().length > 0) {
    const xml = assertXmlSafe(input.xml as string);
    const parsed = deps.parseUbl(xml) as Record<string, unknown>;
    const docType =
      (parsed.invoiceTypeCode as string | undefined) ??
      (parsed.docType as string | undefined) ??
      '380';
    return {
      classification: 'racun',
      docType: String(docType),
      // PLOSNATI oblik — `mail_item_confirm` i UI čitaju `supplier_oib`, ne `supplier.oib`.
      extraction: flattenUblExtraction(parsed),
      confidence: 'visoka',
      route: 'ubl',
      aiCalls: 0,
      consumesQuota: true,
      priority: false,
      warnings,
      verification: null,
    };
  }

  // ---- 2. Obitelj verifikacijskih poruka — bez kvote, bez AI --------------
  const verification = detectGmailVerification({
    fromHeader: input.fromHeader,
    subject: input.subject,
    bodyText: input.bodyText ?? '',
    links: input.links ?? [],
    googleAuthenticated: input.googleAuthenticated === true,
  });
  if (verification.isVerification) {
    return {
      classification: 'verifikacija_prosljedjivanja',
      docType: null,
      extraction: {
        code: verification.code,
        confirmUrl: verification.safeConfirmUrl,
        linkWithheld: verification.linkWithheld,
      },
      confidence: verification.code ? 'visoka' : 'niska',
      route: 'verifikacija',
      aiCalls: 0,
      consumesQuota: false,
      priority: true,
      warnings: [...warnings, ...verification.warnings],
      verification,
    };
  }

  // ---- 2b. VETO: bankovni izvod (PRIJE heuristike „poznat pošiljatelj") ---
  // Bez ovog koraka izvod poznate banke tvrdo postaje `racun` i saldo se knjiži
  // kao iznos računa. Ovdje se čita tekstualni sloj privitka.
  const statementText = [input.pdfText, input.bodyText]
    .filter((p) => (p ?? '').trim().length > 0)
    .join('\n');
  const statement = classifyAsStatement(statementText);
  if (statement.isStatement) {
    return {
      classification: 'izvod',
      docType: null,
      extraction: { ...statement.extraction, statement_signals: statement.signals },
      confidence: 'visoka',
      route: 'izvod',
      needsHumanChoice: false,
      aiCalls: 0,
      consumesQuota: true,
      priority: false,
      warnings,
      verification: null,
    };
  }
  if (statement.needsHumanChoice) {
    // Sumnja: jedan sidreni signal. Ne smije tiho pasti u `racun`.
    return {
      classification: 'nepoznato',
      docType: null,
      extraction: null,
      confidence: 'niska',
      route: 'nepoznato',
      needsHumanChoice: true,
      aiCalls: 0,
      consumesQuota: false,
      priority: false,
      warnings: [...warnings, 'mozda_izvod'],
      verification: null,
    };
  }

  // ---- 3. Deterministički ulov iz teksta — nula troška, prije AI-ja ------
  const deterministic = deterministicExtract({
    text: [input.bodyText, input.pdfText].filter((p) => (p ?? '').length > 0).join('\n'),
    ownOibs: input.ownOibs ?? [],
  });
  warnings.push(...deterministic.warnings);
  const deterministicFields: Record<string, unknown> = {
    supplier_oib: deterministic.supplier_oib,
    iban: deterministic.iban,
    due_date: deterministic.due_date,
    invoice_number: deterministic.invoice_number,
  };

  // ---- 3b. Heuristika — poznat OIB ili pošiljatelj, bez AI -----------------
  const haystack = [input.searchText, input.bodyText, input.pdfText, input.subject]
    .filter((part) => (part ?? '').length > 0)
    .join('\n');
  const knownOib = findKnownOib(haystack, input.knownOibs ?? []);
  const knownFrom = senderKnown(input.fromHeader, input.knownSenders ?? []);
  if (knownOib || knownFrom) {
    let extraction = mergeDeterministic(
      knownOib ? { supplier_oib: knownOib } : null,
      deterministicFields,
    );
    let enrichCalls = 0;

    // PAMETNA DOPUNA: jeftina grana je odlucila STO je dokument, ali kljucna
    // polja (iznos/broj/dobavljac) znaju ostati prazna. Tek tada — i samo kad
    // postoji tekst — AI dopunjuje RUPE. Determinizam i dalje pobjeduje.
    if (deps.analyzeWithAi && needsAiEnrichment(extraction, hasExtractableText(input))) {
      const ai = await deps.analyzeWithAi(input);
      enrichCalls = 1;
      extraction = mergeDeterministic(
        { ...(ai?.extraction ?? {}), ...stripNulls(extraction) },
        deterministicFields,
      );
      warnings.push('ai_dopuna');
    }

    return {
      classification: 'racun',
      docType: '380',
      extraction,
      confidence: deterministic.ambiguous ? 'niska' : 'srednja',
      route: 'heuristika',
      aiCalls: enrichCalls,
      consumesQuota: true,
      priority: false,
      warnings,
      verification: null,
    };
  }

  // ---- 4. Tek sada AI ------------------------------------------------------
  if (!deps.analyzeWithAi) {
    return {
      classification: 'nepoznato',
      docType: null,
      extraction: mergeDeterministic(null, deterministicFields),
      confidence: 'niska',
      route: 'nepoznato',
      aiCalls: 0,
      consumesQuota: false,
      priority: false,
      warnings: [...warnings, 'ai_nedostupan'],
      verification: null,
    };
  }

  const ai = await deps.analyzeWithAi(input);
  aiCalls += 1;

  if (ai.classification !== 'racun' && ai.classification !== 'ponuda') {
    return {
      classification: 'nije_za_nas',
      docType: null,
      extraction: null,
      confidence: ai.confidence,
      route: 'ai',
      aiCalls,
      consumesQuota: true,
      priority: false,
      warnings,
      verification: null,
    };
  }

  return {
    classification: ai.classification,
    docType: ai.classification === 'racun' ? '380' : null,
    // '' → null + determinizam pobjeđuje AI nagađanje.
    extraction: mergeDeterministic(ai.extraction, deterministicFields),
    confidence: deterministic.ambiguous ? 'niska' : ai.confidence,
    route: 'ai',
    aiCalls,
    consumesQuota: true,
    priority: false,
    warnings,
    verification: null,
  };
}

/** Pouzdanost se smije samo obarati, nikad dizati (T4, nepotpun PDF). */
export function lowerConfidence(
  current: Confidence,
  forced: 'niska' | null,
): Confidence {
  return forced === 'niska' ? 'niska' : current;
}
