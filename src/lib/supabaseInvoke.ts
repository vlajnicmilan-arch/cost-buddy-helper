/**
 * supabaseInvoke — wrapper around `supabase.functions.invoke()` that adds
 * automatic diagnostic logging for performance and errors.
 *
 * Drop-in replacement: same return shape `{ data, error }`. Existing callers
 * can be migrated incrementally — no rush, both APIs work side by side.
 *
 * What it does:
 *  - Measures duration; if > 5s, logs a performance warning.
 *  - On `{ error }` return value: logs `edge_function_error` (severity: error).
 *  - On thrown exception: logs and re-throws so the caller's existing
 *    try/catch still works.
 */
import { supabase } from '@/integrations/supabase/client';
import { logDiagnostic, logPerformance } from '@/lib/diagnosticLogger';

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** ms — duration above this threshold logs a perf warning. Default 5000. */
  slowThresholdMs?: number;
  /** Set to false to skip success-path perf logging entirely. */
  trackPerformance?: boolean;
}

interface InvokeResult<T = unknown> {
  data: T | null;
  error: Error | null;
}

export const supabaseInvoke = async <T = unknown>(
  functionName: string,
  options: InvokeOptions = {}
): Promise<InvokeResult<T>> => {
  const { body, headers, slowThresholdMs = 5000, trackPerformance = true } = options;
  const start = performance.now();

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers,
    });
    const dur = performance.now() - start;

    if (error) {
      logDiagnostic({
        event: 'edge_function_error',
        severity: 'error',
        details: {
          function: functionName,
          message: (error as any)?.message ?? String(error),
          status: (error as any)?.status ?? (error as any)?.context?.status,
          duration_ms: Math.round(dur),
        },
      });
      return { data: null, error: error as unknown as Error };
    }

    if (trackPerformance && dur >= slowThresholdMs) {
      logPerformance(`edge:${functionName}`, dur, { slow: true });
    }

    return { data: data as T, error: null };
  } catch (err: any) {
    const dur = performance.now() - start;
    logDiagnostic({
      event: 'edge_function_error',
      severity: 'error',
      details: {
        function: functionName,
        message: err?.message ?? String(err),
        thrown: true,
        duration_ms: Math.round(dur),
      },
    });
    throw err;
  }
};
