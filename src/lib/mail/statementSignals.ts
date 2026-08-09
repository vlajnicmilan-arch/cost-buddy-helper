/**
 * Klijentski ulaz u VETO klasifikaciju bankovnog izvoda.
 * Implementacija je dijeljena s Edge funkcijama — kod i worker se ne smiju razići.
 */
export {
  STATEMENT_SIGNAL_THRESHOLD,
  classifyAsStatement,
  statementSignals,
  type StatementExtraction,
  type StatementVerdict,
} from '../../../supabase/functions/_shared/mailImport/statementSignals.ts';
