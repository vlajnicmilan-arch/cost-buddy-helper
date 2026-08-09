import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * ČUVAR VODORAVNOG PRELJEVA: eRačun ekran ("Dugujem" / "Duguju mi") ne smije
 * na uskim ekranima biti širi od viewporta. Uzrok kvara bio je alatni redak
 * s tabovima (Neplaćeni/Plaćeni/Sve) i gumbom "Učitaj eRačun (XML)" u istom
 * retku BEZ `flex-wrap` — elementi se nisu lomili nego gurali van ekrana.
 *
 * Odabran statički čuvar (isti obrazac kao `pageContainerUsage.test.ts`):
 * provjerava da alatni redak ima `flex-wrap`, da tabovi i gumbi smiju skupiti
 * (`min-w-0`), te da sheet omotač reže vodoravni preljev.
 */
describe('eRacun panel — horizontal overflow guard', () => {
  const panel = read('src/components/business/eracun/IncomingInvoicesPanel.tsx');
  const widget = read('src/components/business/eracun/IncomingInvoicesWidget.tsx');

  it('toolbar row wraps instead of overflowing', () => {
    expect(panel).toMatch(/flex flex-wrap items-center justify-between gap-2/);
  });

  it('no non-wrapping justify-between toolbar remains', () => {
    expect(panel).not.toMatch(/className="flex items-center justify-between gap-2"/);
  });

  it('root container is width-constrained and clips horizontal overflow', () => {
    expect(panel).toMatch(/space-y-3 w-full min-w-0 overflow-x-hidden/);
  });

  it('tab triggers and action buttons may shrink', () => {
    const minW0 = panel.match(/min-w-0/g) ?? [];
    expect(minW0.length).toBeGreaterThanOrEqual(6);
    expect(panel).toMatch(/flex-1 sm:flex-none min-w-0/);
  });

  it('long button labels truncate instead of pushing width', () => {
    expect(panel).toMatch(/<span className="truncate">\{t\('eracun\.importButton'/);
  });

  it('sheet wrapper clips horizontal overflow', () => {
    expect(widget).toMatch(/overflow-x-hidden/);
  });
});
