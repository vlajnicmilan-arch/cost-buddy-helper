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

export type Classification =
  | 'racun'
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
  links?: readonly string[];
  googleAuthenticated?: boolean;
  /** OIB-i i adrese pošiljatelja koje smo već potvrdili u prošlosti. */
  knownSenders?: readonly string[];
  knownOibs?: readonly string[];
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
  route: 'ubl' | 'verifikacija' | 'heuristika' | 'ai' | 'nepoznato';
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

const findKnownOib = (text: string, knownOibs: readonly string[]): string | null => {
  if (knownOibs.length === 0) return null;
  const set = new Set(knownOibs.map((o) => o.trim()));
  const matches = (text ?? '').match(OIB_RE) ?? [];
  return matches.find((m) => set.has(m)) ?? null;
};

const senderKnown = (from: string | null | undefined, known: readonly string[]): boolean => {
  const addr = (from ?? '').toLowerCase();
  return known.some((k) => k.trim().length > 0 && addr.includes(k.toLowerCase().trim()));
};

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
      extraction: parsed,
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

  // ---- 3. Heuristika — poznat OIB ili pošiljatelj, bez AI -----------------
  const haystack = `${input.searchText ?? ''}\n${input.bodyText ?? ''}\n${input.subject ?? ''}`;
  const knownOib = findKnownOib(haystack, input.knownOibs ?? []);
  const knownFrom = senderKnown(input.fromHeader, input.knownSenders ?? []);
  if (knownOib || knownFrom) {
    return {
      classification: 'racun',
      docType: '380',
      extraction: knownOib ? { supplier_oib: knownOib } : null,
      confidence: 'srednja',
      route: 'heuristika',
      aiCalls: 0,
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
      extraction: null,
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
    extraction: ai.extraction,
    confidence: ai.confidence,
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
