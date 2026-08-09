import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePdfImport } from '@/contexts/PdfImportContext';
import { computeFileHash, findExistingStatement, type ExistingStatement } from '@/lib/statementFingerprint';
import type { CustomPaymentSource } from '@/types/customPaymentSource';

/**
 * MOST — bankovni izvod iz e-maila → POSTOJEĆI uvoz izvoda.
 *
 * Ovdje se NE parsira ništa novo: privitak se preuzme iz pohrane, zamota u
 * `File` i preda `startPdfImport`. Tako izvod iz maila i izvod s diska prolaze
 * kroz ISTI put (parsiranje, dedup, spajanje, sidro salda).
 *
 * Otisak izvoda (`imported_statements`) provjerava se PRIJE otvaranja uvoza —
 * ponovni dolazak istog maila ne smije otvoriti prazan tijek. Korisnik svejedno
 * smije reći „uvezi ipak" (`forceImport`).
 */

const BUCKET = 'inbound-mail';

export type StatementImportStart =
  | { kind: 'started' }
  | { kind: 'duplicate'; existing: ExistingStatement }
  | { kind: 'error'; reason: string };

export function useStatementImport() {
  const { user } = useAuth();
  const pdfImport = usePdfImport();
  const [busy, setBusy] = useState(false);

  const downloadAttachment = useCallback(async (storagePath: string): Promise<File | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
    if (error || !data) {
      console.warn('[useStatementImport] download failed:', error?.message);
      return null;
    }
    const name = storagePath.split('/').pop() || 'izvod.pdf';
    return new File([data], name, { type: data.type || 'application/pdf' });
  }, []);

  const startImport = useCallback(
    async (params: {
      storagePath: string;
      source: CustomPaymentSource;
      force?: boolean;
    }): Promise<StatementImportStart> => {
      setBusy(true);
      try {
        const file = await downloadAttachment(params.storagePath);
        if (!file) return { kind: 'error', reason: 'preuzimanje' };

        if (!params.force && user?.id) {
          try {
            const fileHash = await computeFileHash(file);
            const existing = await findExistingStatement(user.id, { fileHash });
            if (existing) return { kind: 'duplicate', existing };
          } catch {
            // Otisak nije uspio — dedup u samom uvozu ostaje kao druga brana.
          }
        }

        await pdfImport.startPdfImport({
          file,
          source: params.source,
          forceImport: params.force === true,
        });
        return { kind: 'started' };
      } finally {
        setBusy(false);
      }
    },
    [downloadAttachment, pdfImport, user?.id],
  );

  return { busy, startImport };
}

/** Stavka reda pregleda je uvezena kao izvod — više ne čeka odluku. */
export async function markIngestItemLinked(itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('document_ingest_items')
    .update({ status: 'povezan' })
    .eq('id', itemId);
  if (error) {
    console.warn('[markIngestItemLinked] failed:', error.message);
    return false;
  }
  return true;
}
