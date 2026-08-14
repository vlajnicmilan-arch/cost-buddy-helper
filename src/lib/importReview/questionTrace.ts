/**
 * SLJEDIVOST KLASIFIKATORA — trag za redak koji je završio kao PITANJE.
 *
 * Klasifikacija se ne mijenja: ovo je samo dijagnostički otisak koji odgovara
 * na pitanje „koje je ime AI čitač zapravo vratio za taj redak". Parsirani
 * redci žive samo u sessionStorage, pa bez ovoga nema dokaza nakon uvoza.
 *
 * Pravila:
 *  - jedan event po pitanju; ništa za autoMerge i nove retke,
 *  - bez iznosa i bez sirovog teksta — samo IZVEDENA imena (deriveComparableName),
 *  - imena su odrezana na 40 znakova.
 *
 * Čisti modul — bez Reacta i IO-a; upisivač se predaje izvana.
 */

import { deriveComparableName } from './comparableName';
import type {
  ClassifierImportedRow,
  ClassifierManualCandidate,
  QuestionEntry,
} from '../importClassifier';

export const TRACE_EVENT = 'import_question_trace';

/** Gornja granica duljine izvedenog imena u tragu. */
export const TRACE_NAME_MAX = 40;

export interface QuestionTraceDetails {
  readonly build: string;
  readonly reason: QuestionEntry['reason'];
  readonly bank_derived: string;
  readonly manual_derived: string;
  readonly raw_merchant_present: boolean;
  readonly candidates_count: number;
}

export interface QuestionTraceInput {
  readonly build: string;
  readonly questions: readonly QuestionEntry[];
  readonly imported: readonly ClassifierImportedRow[];
  readonly manualCandidates: readonly ClassifierManualCandidate[];
  readonly statementBankName?: string | null;
}

const clip = (s: string): string => (s.length > TRACE_NAME_MAX ? s.slice(0, TRACE_NAME_MAX) : s);

export function buildQuestionTraces(input: QuestionTraceInput): QuestionTraceDetails[] {
  const byIndex = new Map<number, ClassifierImportedRow>();
  input.imported.forEach((r) => byIndex.set(r.index, r));
  const byId = new Map<string, ClassifierManualCandidate>();
  input.manualCandidates.forEach((c) => byId.set(c.id, c));

  const out: QuestionTraceDetails[] = [];
  for (const q of input.questions) {
    const row = byIndex.get(q.importedIndex);
    const firstCandidate = q.candidateIds.length > 0 ? byId.get(q.candidateIds[0]) : undefined;
    out.push({
      build: input.build,
      reason: q.reason,
      bank_derived: clip(
        row
          ? deriveComparableName({
              merchantName: row.merchantName,
              description: row.description,
              statementBankName: input.statementBankName ?? null,
            })
          : '',
      ),
      manual_derived: clip(
        firstCandidate
          ? deriveComparableName({
              merchantName: firstCandidate.merchantName,
              description: firstCandidate.description,
            })
          : '',
      ),
      raw_merchant_present: Boolean(row?.merchantName && String(row.merchantName).trim().length > 0),
      candidates_count: q.candidateIds.length,
    });
  }
  return out;
}

/** Upisuje jedan event po pitanju; za prazan popis pitanja ne radi ništa. */
export function emitQuestionTraces(
  input: QuestionTraceInput,
  log: (event: string, details: Record<string, unknown>) => void,
): void {
  for (const details of buildQuestionTraces(input)) {
    log(TRACE_EVENT, { ...details });
  }
}
