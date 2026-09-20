import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rowsAffected, wasDeleteApplied } from '../deleteConfirmation';

describe('wasDeleteApplied', () => {
  it('0 vraćenih redaka (RLS odbio, bez greške) = NEUSPJEH', () => {
    expect(wasDeleteApplied([])).toBe(false);
    expect(rowsAffected([])).toBe(0);
  });

  it('null / undefined (nema .select) = NEUSPJEH', () => {
    expect(wasDeleteApplied(null)).toBe(false);
    expect(wasDeleteApplied(undefined)).toBe(false);
  });

  it('barem jedan redak = uspjeh', () => {
    expect(wasDeleteApplied([{ id: 'a' }])).toBe(true);
    expect(rowsAffected([{ id: 'a' }, { id: 'b' }])).toBe(2);
  });
});

describe('brisanje novčanika i izlazak iz dijeljenja traže retke natrag', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

  it('deleteCustomPaymentSource koristi .select i tretira 0 redaka kao grešku', () => {
    const src = read('hooks/useCustomPaymentSources.ts');
    const fn = src.slice(src.indexOf('const deleteCustomPaymentSource'));
    const body = fn.slice(0, fn.indexOf('\n  };'));
    expect(body).toMatch(/\.delete\(\)[\s\S]*?\.eq\('id', id\)[\s\S]*?\.select\('id'\)/);
    expect(body).toMatch(/wasDeleteApplied|data\.length === 0/);
    expect(body).toMatch(/payment_source_delete_noop/);
    // Lokalno stanje se NE dira prije provjere: `return` mora doći prije setState.
    expect(body.indexOf('return;')).toBeLessThan(body.indexOf('setCustomPaymentSources(prev =>'));
  });

  it('leaveSharedSource također provjerava broj obrisanih redaka', () => {
    const src = read('hooks/usePaymentSourceMembers.ts');
    const fn = src.slice(src.indexOf('const leaveSharedSource'));
    const body = fn.slice(0, fn.indexOf('\n  };'));
    expect(body).toMatch(/\.delete\(\)[\s\S]*?\.select\('id'\)/);
    expect(body).toMatch(/wasDeleteApplied|removed\.length === 0/);
  });

  it('ne-vlasniku se ne nudi brisanje novčanika', () => {
    const panel = read('components/custom-payment-sources/CustomPaymentSourcesPanel.tsx');
    expect(panel).toMatch(/source\.isOwned !== false && \(/);
  });
});
