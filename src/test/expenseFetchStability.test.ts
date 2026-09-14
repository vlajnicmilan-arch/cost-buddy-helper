import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync('src/hooks/useExpenseFetch.ts', 'utf8');

describe('stabilnost velikog dohvata transakcija', () => {
  it('jedan rok od 90 s obuhvaća cijeli dohvat, ne pojedinu stranicu', () => {
    expect(SOURCE).toContain('withTimeoutAndDrain(loadAllPages, EXPENSES_FETCH_TIMEOUT_MS');
    expect(SOURCE).not.toMatch(/fetchPage[\s\S]{0,200}withTimeout/);
  });

  it('snimka se čeka prije početnog mrežnog osvježavanja', () => {
    expect(SOURCE).toMatch(/await snapshotHydrationRef\.current;[\s\S]{0,120}fetchOwnedSources\(\)/);
  });

  it('pad mreže ne briše već prikazane transakcije', () => {
    const catchBlock = SOURCE.slice(SOURCE.indexOf("console.error('Error fetching expenses:'"));
    expect(catchBlock.slice(0, 1800)).not.toContain('setExpenses([])');
  });

  it('svaka uspješna stranica zapisuje trajanje i broj redaka', () => {
    expect(SOURCE).toContain("event: 'expense_fetch_page'");
    expect(SOURCE).toMatch(/event: 'expense_fetch_page'[\s\S]{0,180}rows:[\s\S]{0,80}ms:/);
  });
});