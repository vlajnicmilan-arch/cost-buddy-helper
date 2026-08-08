/**
 * Source guard — `krug-add-member` notify auth header.
 *
 * 2026-08-08: svaki poziv `notify-krug-event` iz ove funkcije vraćao je 401 jer
 * je supabase-js slao service role key, a guard u notifieru ga nije prepoznao
 * (drift nakon rotacije ključa). Pozivnica bi se upisala, obavijest ne bi, a
 * jedini trag bio je `notified:false` koji nitko ne gleda.
 *
 * Ovaj test drži popravak: notify poziv MORA graditi Authorization iz
 * KRUG_NOTIFY_INTERNAL_KEY, sa service keyem samo kao glasnim fallbackom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../../supabase/functions/krug-add-member/index.ts'),
  'utf8',
);

describe('krug-add-member notify auth', () => {
  it('reads KRUG_NOTIFY_INTERNAL_KEY', () => {
    expect(SRC).toMatch(/Deno\.env\.get\(\s*["']KRUG_NOTIFY_INTERNAL_KEY["']\s*\)/);
  });

  it('sends an explicit Authorization header on the notify invoke', () => {
    expect(SRC).toMatch(
      /functions\.invoke\(\s*\n?\s*["']notify-krug-event["'][\s\S]{0,400}?headers:\s*\{\s*Authorization:\s*`Bearer \$\{notifyToken\}`/,
    );
  });

  it('prefers the internal key over the service key', () => {
    expect(SRC).toMatch(/const notifyToken = internalKey \|\| serviceKey;/);
  });

  it('warns loudly when falling back to the service key', () => {
    expect(SRC).toMatch(/console\.warn\([\s\S]{0,200}KRUG_NOTIFY_INTERNAL_KEY missing/);
  });
});
