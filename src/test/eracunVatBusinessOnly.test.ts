import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * PDV JE POSLOVNI PODATAK: u osobnom kontekstu (nema aktivnog biznis profila)
 * ulazni računi ne smiju prikazivati PDV. Ekstrakcija i spremanje ostaju
 * netaknuti — ovo je isključivo sloj prikaza.
 */
describe('eRacun — PDV samo u poslovnom profilu', () => {
  const panel = read('src/components/business/eracun/IncomingInvoicesPanel.tsx');

  it('PDV redak je uvjetovan poslovnim kontekstom', () => {
    expect(panel).toMatch(/\{!isPersonal && inv\.vat_amount != null && \(/);
  });

  it('osobni kontekst se i dalje izvodi iz izostanka biznis profila', () => {
    expect(panel).toMatch(/const isPersonal = !activeBusinessProfileId;/);
  });

  it('nema drugog nezaštićenog PDV prikaza u eRačun komponentama', () => {
    const widget = read('src/components/business/eracun/IncomingInvoicesWidget.tsx');
    expect(widget).not.toMatch(/vat_amount/);
    const vatRenders = panel.match(/vat_amount/g) ?? [];
    expect(vatRenders.length).toBe(1);
  });
});
