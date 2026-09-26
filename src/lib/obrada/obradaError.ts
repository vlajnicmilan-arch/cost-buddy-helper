import { logDiagnostic } from '@/lib/diagnosticLogger';
import { getBuildStamp } from '@/lib/buildStamp';

/** Doslovni code/message greške dohvata/računanja Obrade + build stamp. */
export function logObradaError(stage: 'fetch' | 'compute', err: unknown): void {
  const e = err as { code?: string; message?: string } | null;
  logDiagnostic({
    event: 'obrada_error',
    severity: 'error',
    details: {
      stage,
      db_code: e?.code ?? null,
      db_message: String(e?.message ?? err),
      build: getBuildStamp(),
    },
  });
}

export const obradaErrorKey = (): string => 'obrada.errors.loadFailed';
