import { supabase } from '@/integrations/supabase/client';
import { generateInvoicePdf } from './invoicePdf';
import type { ProjectInvoice } from '@/hooks/useProjectInvoices';

/**
 * Uploads an invoice PDF to the private `invoice-pdfs` bucket and returns a
 * signed URL valid for ~7 days. The path is namespaced by user_id so RLS
 * policies enforce per-owner access.
 */
export async function uploadInvoicePdfAndSign(
  invoice: ProjectInvoice,
  paidAmount = 0,
  expiresInSec = 60 * 60 * 24 * 7,
): Promise<{ url: string; path: string } | null> {
  const blob = (await generateInvoicePdf(invoice, { paid: paidAmount, returnBlob: true })) as Blob;
  if (!blob || !(blob instanceof Blob)) return null;

  const path = `${invoice.user_id}/${invoice.id}-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('invoice-pdfs')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw upErr;

  const { data, error } = await supabase.storage
    .from('invoice-pdfs')
    .createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) throw error || new Error('signed_url_failed');

  return { url: data.signedUrl, path };
}
