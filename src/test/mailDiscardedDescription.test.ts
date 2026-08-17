/**
 * „Odbačeno" mora govoriti istinu: posebne stavke nisu prazni računi.
 */
import { describe, it, expect } from 'vitest';
import { describeDiscardedItem } from '@/lib/mail/discardedDescription';

describe('describeDiscardedItem', () => {
  it.each([
    'verifikacija_prosljedjivanja',
    'privitak_nepodrzan',
    'duplikat_privitka',
    'izvod',
    'nije_za_nas',
    'nepoznato',
  ])('%s dobiva vlastiti naslov i objašnjenje', (cls) => {
    const d = describeDiscardedItem({ classification: cls });
    expect(d.kind).toBe('special');
    expect(d.titleKey).toBe(`documents.discarded.kind.${cls}.title`);
    expect(d.titleFallback.length).toBeGreaterThan(3);
    expect(d.reasonFallback.length).toBeGreaterThan(3);
  });

  it('račun i ponuda zadržavaju prikaz polja računa', () => {
    expect(describeDiscardedItem({ classification: 'racun' }).kind).toBe('invoice');
    expect(describeDiscardedItem({ classification: 'ponuda' }).kind).toBe('invoice');
    expect(describeDiscardedItem({ classification: null }).kind).toBe('invoice');
  });
});
