import { useEffect } from 'react';
import { markIngestItemLinked } from '@/hooks/useStatementImport';
import {
  clearPendingStatementLink,
  loadPendingStatementLink,
  matchesPendingLink,
} from '@/lib/mail/statementImportLink';

/**
 * GLOBALNI razrješitelj veze „kartica izvoda → uvoz".
 *
 * Sluša `vm:pdf-import-completed` (šalje se tek kad je uvoz ZAPISAN) i tada
 * miče mail stavku iz reda „Na pregled" u status `povezan`. Živi izvan
 * kartice da veza preživi navigaciju, pad i nastavak sačuvane skice.
 */
export function useStatementLinkResolver(): void {
  useEffect(() => {
    const onDone = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { sourceId?: string | null; fileName?: string | null }
        | undefined;
      const link = loadPendingStatementLink();
      if (
        !matchesPendingLink(link, {
          sourceId: detail?.sourceId ?? null,
          fileName: detail?.fileName ?? null,
        })
      ) {
        return;
      }
      clearPendingStatementLink();
      void markIngestItemLinked(link!.itemId).then((ok) => {
        if (!ok) return;
        try {
          window.dispatchEvent(
            new CustomEvent('vm:mail-statement-linked', { detail: { itemId: link!.itemId } }),
          );
          window.dispatchEvent(new CustomEvent('vm:mail-pending-changed'));
        } catch {
          /* noop */
        }
      });
    };

    window.addEventListener('vm:pdf-import-completed', onDone);
    return () => window.removeEventListener('vm:pdf-import-completed', onDone);
  }, []);
}
