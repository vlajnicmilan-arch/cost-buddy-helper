/**
 * BRANA (a9b9c5f regresija): useStatusFeedback i loadWithRetry NE smiju
 * uvoziti @/lib/errorMessages ni @/i18n — taj lanac inicijalizira i18next
 * na engleskom u svakom testu koji dira obavijesti.
 */
import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import fs from 'node:fs';
import path from 'node:path';

describe('uvoz modula obavijesti ne inicijalizira i18next', () => {
  it('i18next ostaje neinicijaliziran nakon importa useStatusFeedback i loadWithRetry', async () => {
    expect(i18next.isInitialized).not.toBe(true);
    await import('@/hooks/useStatusFeedback');
    await import('@/lib/loadWithRetry');
    expect(i18next.isInitialized).not.toBe(true);
  });

  it('datoteke nemaju uvoz iz errorMessages/i18n', () => {
    for (const file of ['src/hooks/useStatusFeedback.ts', 'src/lib/loadWithRetry.ts']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]@\/lib\/errorMessages['"]/);
      expect(src, file).not.toMatch(/from ['"]@\/i18n/);
    }
  });
});
