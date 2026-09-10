/**
 * Klijentski ulaz u JEDINI prevoditelj datuma mail uvoza.
 * Implementacija je dijeljena s Edge funkcijama — kod i baza se ne smiju razići.
 */
export {
  DATE_FIELD_KEYS,
  FUTURE_DATE_WARNING,
  hasFutureDate,
  normalizeDateToIso,
  normalizeExtractionDates,
} from '../../../supabase/functions/_shared/mailImport/dateNormalize.ts';
export type { DateNormalizeOptions } from '../../../supabase/functions/_shared/mailImport/dateNormalize.ts';
