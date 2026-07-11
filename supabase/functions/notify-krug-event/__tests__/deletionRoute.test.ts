/**
 * Val B follow-up B — source guard.
 *
 * Osigurava da `notify-krug-event` writer i dalje generira route s
 * `?id=<krug_id>` samo za `krug_deletion_requested`, a `/krug` za sve
 * ostale MVP tipove. Regresija je jeftina: čita source i traži uzorak.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../index.ts'),
  'utf8',
);

describe('notify-krug-event route wiring', () => {
  it('krug_deletion_requested route embeds krug_id', () => {
    expect(SRC).toMatch(
      /event_type\s*===\s*["']krug_deletion_requested["'][\s\S]*?\/krug\?id=\$\{krug_id\}/,
    );
  });

  it('krug_deleted MUST NOT embed krug_id (Krug je obrisan)', () => {
    expect(SRC).not.toMatch(
      /event_type\s*===\s*["']krug_deleted["'][\s\S]*?\/krug\?id=/,
    );
  });
});
