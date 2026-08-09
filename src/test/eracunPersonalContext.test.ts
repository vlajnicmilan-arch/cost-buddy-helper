import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * ČUVAR KONTEKSTA POLICE: `IncomingInvoicesPanel` je JEDNA zajednička
 * komponenta, ali u OSOBNOM kontekstu (nema aktivnog biznis profila) ne smije
 * nuditi biznis alate — privatna osoba ne izdaje račune i ne naplaćuje.
 *
 * Skriveno u osobnom: tabovi „Dugujem/Duguju mi", „Poveži uplate",
 * uvoz „Učitaj eRačun (XML)" (resolveDirection bez OIB-a tvrtke ne može
 * pouzdano odrediti smjer), te dijalozi naplate i uparivanja uplata.
 * Ostaje sve za ulazne: „Poveži s troškom", „Plaćeno" s pretprovjerom,
 * oznake mjesta i filtri.
 */
describe('eRacun — osobni kontekst nema biznis alate', () => {
  const panel = read('src/components/business/eracun/IncomingInvoicesPanel.tsx');
  const widget = read('src/components/business/eracun/IncomingInvoicesWidget.tsx');

  it('panel izvodi osobni kontekst iz izostanka biznis profila', () => {
    expect(panel).toMatch(/const isPersonal = !activeBusinessProfileId;/);
    expect(panel).toMatch(/const direction: Direction = isPersonal \? 'in' : directionState;/);
  });

  it('tabovi smjera se ne renderiraju u osobnom', () => {
    expect(panel).toMatch(/\{!isPersonal && \(\s*<Tabs value=\{direction\}/);
  });

  it('„Poveži uplate" i XML uvoz su iza !isPersonal', () => {
    const block = panel.slice(panel.indexOf("eracun.match.open") - 800, panel.indexOf("eracun.importButton"));
    expect(block).toMatch(/\{!isPersonal && \(/);
  });

  it('dijalozi uvoza, naplate i uparivanja se ne montiraju u osobnom', () => {
    expect(panel).toMatch(/\{user && !isPersonal && \(/);
    expect(panel).toMatch(/\{!isPersonal && \(\s*<MarkCollectedDialog/);
    expect(panel).toMatch(/\{!isPersonal && \(\s*<PaymentMatchReview/);
  });

  it('ulazni alati ostaju bezuvjetni', () => {
    expect(panel).toMatch(/eracun\.linkExpense\.open/);
    expect(panel).toMatch(/eracun\.list\.markPaid/);
    expect(panel).toMatch(/eracun\.list\.placeEdit/);
    expect(panel).not.toMatch(/!isPersonal[^\n]*linkExpense/);
  });

  it('widget u osobnom skriva „Duguju mi" i mijenja naslov', () => {
    expect(widget).toMatch(/const isPersonal = !activeBusinessProfileId;/);
    expect(widget).toMatch(/\{!isPersonal && row\(receivable/);
    expect(widget).toMatch(/eracun\.widget\.sheetTitlePersonal/);
  });
});
