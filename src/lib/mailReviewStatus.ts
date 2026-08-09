import { supabase } from '@/integrations/supabase/client';

/**
 * MAIL UVOZ — povratak odbačene stavke u red „Na pregled".
 * Jedno mjesto istine: koristi ga i „Vrati" u arhivi i UNDO toast nakon odbacivanja.
 */
export async function restoreIngestItem(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('document_ingest_items')
    .update({ status: 'na_pregledu' })
    .eq('id', itemId);
  if (error) {
    console.warn('[restoreIngestItem] failed:', error.message);
    return false;
  }
  return true;
}
