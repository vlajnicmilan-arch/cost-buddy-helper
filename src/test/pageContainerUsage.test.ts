import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * ČUVAR ŠIRINE: puni ekrani moraju koristiti standardni layout omotač
 * (`PageContainer`), inače sadržaj bježi od ruba do ruba na širokim monitorima.
 */
describe('PageContainer usage on full-screen views', () => {
  const files = [
    'src/pages/Documents.tsx',
    'src/components/business/eracun/IncomingInvoicesWidget.tsx',
    'src/pages/ImportReview.tsx',
  ];


  it.each(files)('%s imports and renders PageContainer', (file) => {
    const src = read(file);
    expect(src).toMatch(/from '@\/components\/layout\/PageContainer'/);
    expect(src).toMatch(/<PageContainer/);
  });

  it('PageContainer keeps the shared max-width pattern', () => {
    const src = read('src/components/layout/PageContainer.tsx');
    expect(src).toContain('max-w-4xl mx-auto px-3 sm:px-4');
  });

  it('Documents screen has no raw full-width main wrapper', () => {
    const src = read('src/pages/Documents.tsx');
    expect(src).not.toMatch(/<main className="p-4">/);
  });
});
