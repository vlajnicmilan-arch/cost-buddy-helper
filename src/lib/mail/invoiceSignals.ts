/**
 * Klijentski ulaz u prepoznavanje jasnog račun-signala.
 * Implementacija je dijeljena s Edge funkcijama — kod i worker se ne smiju razići.
 */
export { carriesInvoiceSignal } from '../../../supabase/functions/_shared/mailImport/invoiceSignals.ts';
