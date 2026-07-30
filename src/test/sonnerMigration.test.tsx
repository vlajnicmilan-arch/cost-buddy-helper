import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import StatusFeedback from '@/components/StatusFeedback';
import { showSuccess, showWarning, showError, __resetFeedbackDedup, dismissFeedback } from '@/hooks/useStatusFeedback';

/**
 * Faza 3 migracije obavijesti: direktni sonner `toast.*` pozivi su dopušteni
 * SAMO u whitelistanim datotekama (iznimke). Sve ostalo ide kroz
 * useStatusFeedback store (CentarNote).
 */
const WHITELIST = [
  'src/components/ui/sonner.tsx', // Toaster wrapper (sonner ostaje montiran)
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

  it('iznimke i dalje koriste sonner (Toaster ostaje potreban)', () => {
    for (const rel of WHITELIST) {
      const text = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(text).toMatch(/from ['"]sonner['"]/);
    }
  });
});

describe('Faza 3 — migrirani pozivi idu kroz CentarNote store', () => {
  afterEach(() => {
    act(() => dismissFeedback());
    __resetFeedbackDedup();
  });

  it('uvoz (wallet): "nema novih transakcija" je warning u wallet modulu', () => {
    render(<StatusFeedback />);
    act(() => showWarning('Nema novih transakcija', { module: 'wallet' }));
    const note = screen.getByTestId('centar-note');
    expect(note).toHaveAttribute('data-severity', 'warning');
    expect(note).toHaveAttribute('data-module', 'wallet');
  });

  it('poravnanje salda (wallet host): uspjeh ide kroz store s eksplicitnim modulom', () => {
    render(<StatusFeedback />);
    act(() => showSuccess('Saldo poravnat', { module: 'wallet' }));
    const note = screen.getByTestId('centar-note');
    expect(note).toHaveAttribute('data-severity', 'info');
    expect(note).toHaveAttribute('data-module', 'wallet');
  });

  it('write guard: greška s CTA akcijom je sticky i prikazuje gumb', () => {
    render(<StatusFeedback />);
    act(() =>
      showError('Akcija nije dopuštena bez pretplate.', {
        module: 'centar',
        action: { label: 'Aktiviraj', onClick: () => {} },
      }),
    );
    const note = screen.getByTestId('centar-note');
    expect(note).toHaveAttribute('data-severity', 'error');
    expect(screen.getByText('Aktiviraj')).toBeInTheDocument();
  });
});
