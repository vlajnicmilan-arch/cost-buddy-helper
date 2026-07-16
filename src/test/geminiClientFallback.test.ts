import { describe, it, expect, beforeAll } from 'vitest';

// Shim Deno for Node/vitest runtime — geminiClient reads env at module load.
beforeAll(() => {
  (globalThis as any).Deno = (globalThis as any).Deno ?? {
    env: { get: (_k: string) => undefined },
  };
});

describe('shouldFallbackOnError', () => {
  it('retries on 404 "no longer available"', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(
      shouldFallbackOnError(404, 'Gemini 2.5 model is no longer available to new users'),
    ).toBe(true);
  });

  it('retries on 404 model_not_found', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(shouldFallbackOnError(404, '{"error":"model_not_found"}')).toBe(true);
  });

  it('does NOT retry on 429 rate limit', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(shouldFallbackOnError(429, 'rate limit exceeded')).toBe(false);
  });

  it('does NOT retry on 400 bad request', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(shouldFallbackOnError(400, 'invalid argument')).toBe(false);
  });

  it('does NOT retry on 500', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(shouldFallbackOnError(500, 'internal error')).toBe(false);
  });

  it('does NOT retry on 404 without match text', async () => {
    const { shouldFallbackOnError } = await import(
      '../../supabase/functions/_shared/geminiClient.ts'
    );
    expect(shouldFallbackOnError(404, 'route does not exist')).toBe(false);
  });
});
