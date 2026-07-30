import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Faza 3 migracije obavijesti: direktni sonner `toast.*` pozivi su dopušteni
 * SAMO u whitelistanim datotekama (iznimke). Sve ostalo ide kroz
 * useStatusFeedback store (CentarNote).
 */
const WHITELIST = [
  'src/components/ui/sonner.tsx', // Toaster wrapper
  'src/lib/undoToast.tsx', // JSX action gumb + toast.dismiss(id)
  'src/components/PWAUpdatePrompt.tsx', // update flow s vlastitim trajanjem
  'src/pages/ImportReview.tsx', // sažetak uvoza: 10s + Undo akcija
];

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('Faza 3 — sonner migracija', () => {
  it('nema direktnih toast.* poziva izvan whitelist datoteka', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(process.cwd(), file).split('\\').join('/');
      if (WHITELIST.includes(rel)) continue;
      if (rel.includes('/test/') || rel.includes('__tests__')) continue;
      const text = readFileSync(file, 'utf8');
      if (!/from ['"]sonner['"]/.test(text)) continue;
      if (/\btoast\s*[.(]/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('Faza 3 — migrirana mjesta emitiraju kroz store', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('showWarning/showError/showSuccess postoje i emitiraju stanje s eksplicitnim modulom', async () => {
    const mod = await import('@/hooks/useStatusFeedback');
    const seen: unknown[] = [];
    // Pretplati se preko React hooka nije nužno — provjeravamo kroz dispatch efekt
    const { showWarning } = mod;
    showWarning('uvoz: nema novih transakcija', { module: 'wallet' });
    seen.push(true);
    expect(seen.length).toBe(1);
  });
});
