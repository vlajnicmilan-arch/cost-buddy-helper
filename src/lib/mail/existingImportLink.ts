/**
 * VEZA NA POSTOJEĆI UVOZ.
 *
 * Dokument iz mail lijevka zna biti ISTA datoteka koja je ranije uvezena ručno.
 * Brana protiv duplikata tada ispravno blokira ponovni uvoz, ali korisnik ostaje
 * u slijepoj ulici. Ovdje se NIŠTA ne uvozi — samo se bilježi da papir pripada
 * uvozu koji već postoji (RPC `mail_item_link_existing_import`).
 *
 * Svaki odbijeni ishod i svaka iznimka ostavljaju trag u `app_diagnostics_logs`,
 * s otiskom builda, brojem kandidata i doslovnom porukom baze.
 */
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

export type ExistingImportReason =
  | 'nije_pronaden'
  | 'stanje_ne_dopusta'
  | 'nema_otiska'
  | 'nema_postojeceg_uvoza'
  | 'uvoz_vezan_na_drugi_dokument'
  | 'baza';

export interface ExistingImportProbe {
  found: boolean;
  statementId: string | null;
  importedAt: string | null;
  reason: ExistingImportReason | null;
}

export type LinkExistingImportResult =
  | { ok: true; statementId: string; importedAt: string | null }
  | { ok: false; reason: ExistingImportReason };

const logFailure = (
  event: string,
  itemId: string,
  details: Record<string, unknown>,
) => {
  logDiagnostic({
    event,
    severity: 'error',
    details: { item_id: itemId, build: getBuildStamp(), ...details },
  });
};

/** Postoji li uvoz s istim otiskom privitka? Nikad ne baca. */
export async function probeExistingImport(itemId: string): Promise<ExistingImportProbe> {
  try {
    const { data, error } = await supabase.rpc('mail_item_existing_import' as never, {
      p_item_id: itemId,
    } as never);
    if (error) {
      logFailure('mail_existing_import_probe_failed', itemId, {
        reason: 'baza',
        db_code: (error as { code?: string }).code ?? null,
        db_message: error.message,
      });
      return { found: false, statementId: null, importedAt: null, reason: 'baza' };
    }
    const result = (data ?? {}) as {
      ok?: boolean;
      found?: boolean;
      statement_id?: string;
      imported_at?: string;
      reason?: ExistingImportReason;
      candidates?: number;
      content_sha256?: string;
    };
    if (result.ok === false || result.found !== true) {
      return {
        found: false,
        statementId: null,
        importedAt: null,
        reason: (result.reason as ExistingImportReason) ?? null,
      };
    }
    return {
      found: true,
      statementId: result.statement_id ?? null,
      importedAt: result.imported_at ?? null,
      reason: null,
    };
  } catch (e) {
    logFailure('mail_existing_import_probe_failed', itemId, {
      reason: 'iznimka',
      db_message: e instanceof Error ? e.message : String(e),
    });
    return { found: false, statementId: null, importedAt: null, reason: 'baza' };
  }
}

/** Upiši vezu na postojeći uvoz. Nikad ne baca; razlog je uvijek imenovan. */
export async function linkExistingImport(itemId: string): Promise<LinkExistingImportResult> {
  try {
    const { data, error } = await supabase.rpc('mail_item_link_existing_import' as never, {
      p_item_id: itemId,
    } as never);
    if (error) {
      logFailure('mail_existing_import_link_failed', itemId, {
        reason: 'baza',
        db_code: (error as { code?: string }).code ?? null,
        db_message: error.message,
      });
      return { ok: false, reason: 'baza' };
    }
    const result = (data ?? {}) as {
      ok?: boolean;
      reason?: ExistingImportReason;
      statement_id?: string;
      imported_at?: string;
      candidates?: number;
      content_sha256?: string;
    };
    if (result.ok !== true) {
      logFailure('mail_existing_import_link_failed', itemId, {
        reason: result.reason ?? 'baza',
        candidates: result.candidates ?? null,
        content_sha256: result.content_sha256 ?? null,
      });
      return { ok: false, reason: (result.reason as ExistingImportReason) ?? 'baza' };
    }
    return {
      ok: true,
      statementId: String(result.statement_id),
      importedAt: result.imported_at ?? null,
    };
  } catch (e) {
    logFailure('mail_existing_import_link_failed', itemId, {
      reason: 'iznimka',
      db_message: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: 'baza' };
  }
}

/** Hrvatski (i18n) ključ za svaki razlog — korisnik nikad ne vidi šifru. */
export const EXISTING_IMPORT_REASON_KEY: Record<ExistingImportReason, string> = {
  nije_pronaden: 'statements.linkExisting.error.notFound',
  stanje_ne_dopusta: 'statements.linkExisting.error.state',
  nema_otiska: 'statements.linkExisting.error.noFingerprint',
  nema_postojeceg_uvoza: 'statements.linkExisting.error.noImport',
  uvoz_vezan_na_drugi_dokument: 'statements.linkExisting.error.takenByOther',
  baza: 'statements.linkExisting.error.db',
};
