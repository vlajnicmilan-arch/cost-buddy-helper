/**
 * Klijentski ulaz u VETO klasifikaciju bankovnog izvoda.
 * Implementacija je dijeljena s Edge funkcijama — kod i worker se ne smiju razići.
 */
export {
  STATEMENT_SIGNAL_THRESHOLD,
  ISSUER_ZONE_FALLBACK,
  KNOWN_BANK_NAMES,
  CARD_STATEMENT_SIGNAL,
  cardStatementExtraction,
  cardStatementSignals,

  carriesFinancialSubstance,
  classifyAsStatement,
  detectBankName,
  detectPeriodRange,
  issuerZone,
  issuerZoneEnd,
  parseCroatianWordDate,
  statementSignals,
  type StatementExtraction,
  type StatementVerdict,
} from '../../../supabase/functions/_shared/mailImport/statementSignals.ts';

