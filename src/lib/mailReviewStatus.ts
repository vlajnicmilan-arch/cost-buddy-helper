import { supabase } from '@/integrations/supabase/client';

/**
 * MAIL UVOZ — povratak odbačene stavke u red „Na pregled".
 *
 * Jedno mjesto istine: koristi ga i „Vrati" u arhivi i UNDO toast nakon
 * odbacivanja. Od naloga „aplikacija uči što korisnik odbacuje" ide kroz RPC
 * `mail_item_restore`, jer povratak stavke ujedno PONIŠTAVA naučeno pravilo
 * odbijanja — inače bi aplikacija i dalje tiho gutala tu vrstu poruke.
 */
export async function restoreIngestItem(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('mail_item_restore', { p_item_id: itemId });
  if (error) {
    console.warn('[restoreIngestItem] failed:', error.message);
    await logMailDiagnostic('mail_item_restore_failed', { item_id: itemId, message: error.message });
    return false;
  }
  const result = (data ?? {}) as { ok?: boolean };
  return result.ok !== false;
}

/**
 * Dijagnostički zapis mail lijevka — best-effort, nikad ne ruši radnju.
 * Pravilo od 24.8.2026: svaki pad ostavlja trag u `app_diagnostics_logs`.
 */
export async function logMailDiagnostic(
  event: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from('app_diagnostics_logs').insert([
      { event, details: details as never, user_id: userId, session_id: 'mail-import' },
    ]);
  } catch {
    // tiho — telemetrija ne smije rušiti korisnički put
  }
}
