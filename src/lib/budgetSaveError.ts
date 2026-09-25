import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

/** Doslovni code/message greške spremanja budžeta + build stamp u app_diagnostics_logs. */
export function logBudgetSaveError(action: 'create' | 'update', err: unknown): void {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'budget_save_error',
    severity: 'error',
    details: {
      action,
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
    },
  });
}

/** Prevedena poruka: dvostruki limit iste kategorije ima vlastitu poruku. */
export const budgetSaveErrorKey = (action: 'create' | 'update', err: unknown): string => {
  const code = (err as { code?: string } | null)?.code;
  if (code === '23505') return 'budget.errors.duplicateLimit';
  return action === 'create' ? 'errors.createBudget' : 'errors.updateBudget';
};
