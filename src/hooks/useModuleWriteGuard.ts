/**
 * useModuleWriteGuard — zajednički odgovor na RLS odbijenicu zbog neaktivnog
 * modula. Umjesto generičke "Greška pri dodavanju" korisnik dobiva poruku
 * "Modul {naziv} nije aktivan" s gumbom koji otvara ModuleUpgradeDialog, a
 * u `app_diagnostics_logs` ostaje zapis `module_write_denied`.
 *
 * Koristi se u SVAKOM pisanju u modulnu tablicu:
 *   if (handleModuleWriteError('recurring_transactions', error)) return;
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModuleGate } from '@/hooks/useModuleGate';
import { showError } from '@/hooks/useStatusFeedback';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { APP_VERSION } from '@/lib/version';
import {
  parseModuleWriteDenial,
  moduleNameKey,
  type PgErrorLike,
} from '@/lib/moduleWriteDenied';

export function useModuleWriteGuard() {
  const { t } = useTranslation();
  const { openUpgrade } = useModuleGate();

  const handleModuleWriteError = useCallback(
    (table: string, error: PgErrorLike | null | undefined): boolean => {
      const denial = parseModuleWriteDenial(table, error);
      if (!denial) return false;

      logDiagnostic({
        event: 'module_write_denied',
        severity: 'error',
        details: {
          table: denial.table,
          module: denial.module,
          code: denial.code,
          message: denial.message,
          app_version: APP_VERSION,
        },
      });

      const moduleName = t(moduleNameKey(denial.module));
      showError(
        t('errors.moduleWriteDenied', 'Modul {{module}} nije aktivan', { module: moduleName }),
        {
          action: {
            label: t('errors.moduleWriteDeniedAction', 'Otključaj'),
            onClick: () => openUpgrade(denial.gateModule),
          },
        },
      );
      return true;
    },
    [t, openUpgrade],
  );

  return { handleModuleWriteError };
}
