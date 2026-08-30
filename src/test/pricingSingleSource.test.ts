import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { STICKER_PRICES, PLAN_ORDER } from '@/lib/pricing';

/**
 * Landing je statički HTML i ne može uvoziti `STICKER_PRICES`, pa ovaj test
 * uspoređuje iznose iz cjenika s izvorom istine i puca ako se raziđu.
 */
const FILES = [
  { path: 'src/pages/CentarLanding.body.html', decimal: ',' },
  { path: 'src/pages/CentarLanding.body.de.html', decimal: ',' },
  { path: 'src/pages/CentarLanding.body.en.html', decimal: '.' },
] as const;

function pricesFromTable(html: string): number[] {
  const table = html.match(/<div class="price-table">([\s\S]*?)<\/div>\s*<p class="yearly-note/);
  expect(table, 'price-table blok nije pronađen').toBeTruthy();
  const cells = table![1].match(/<div class="pcell num">([^<]+)<\/div>/g) || [];
  return cells
    .map((c) => c.replace(/<[^>]+>/g, '').trim())
    .filter((s) => /\d/.test(s))
    .map((s) => Number(s.replace(/[^\d.,]/g, '').replace(',', '.')));
}

describe('sticker cijene — jedan izvor istine', () => {
  const expected = PLAN_ORDER.flatMap((p) => [
    STICKER_PRICES[p].monthly,
    STICKER_PRICES[p].yearly,
  ]);

  FILES.forEach(({ path }) => {
    it(`${path} se poklapa sa STICKER_PRICES`, () => {
      const html = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(pricesFromTable(html)).toEqual(expected);
    });
  });
});
