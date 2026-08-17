/**
 * Klijentski ulaz u pravilo „karantena govori".
 * Implementacija je dijeljena s Edge funkcijama — kod i worker se ne smiju razići.
 */
export {
  attachmentTypeLabel,
  isUserFixableQuarantine,
  UNSUPPORTED_ATTACHMENT_CLASSIFICATION,
  USER_FIXABLE_QUARANTINE_REASONS,
} from '../../../supabase/functions/_shared/mailImport/quarantineVisibility.ts';
