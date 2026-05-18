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

/**
 * Uploads a PDF snapshot of the invoice (without payment data) and persists
 * the path on the invoice row. Used so the auto-reminder cron can sign the
 * URL server-side and attach it to emails. Safe to call multiple times —
 * the path is namespaced by user_id and overwrites on upsert.
 */
export async function uploadInvoicePdfSnapshot(invoice: ProjectInvoice): Promise<string | null> {
  const blob = (await generateInvoicePdf(invoice, { returnBlob: true })) as Blob;
  if (!blob || !(blob instanceof Blob)) return null;

  const path = `${invoice.user_id}/${invoice.id}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('invoice-pdfs')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw upErr;

  await (supabase.from('project_invoices') as any)
    .update({ pdf_path: path })
    .eq('id', invoice.id);

  return path;
}
