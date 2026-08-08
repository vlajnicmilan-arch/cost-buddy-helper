/**
 * Guard — ciklus obavijesti za prijedlog ručne podjele (Krug Faza B).
 *
 * Tri sloja moraju ostati usklađena:
 *  1. RPC-ovi emitiraju tipove (SQL guard: supabase/tests/krug/function_overloads.sql)
 *  2. `notify-krug-event` prihvaća tipove i mapira ih na short-key
 *  3. serverski i18n katalog (hr/en/de) ima title+message za svaki short-key
 *
 * Ako netko doda tip bez prijevoda, push obavijest šalje sirovi ključ —
 * točno regresija koju smo već jednom imali.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const fn = readFileSync(resolve(root, 'supabase/functions/notify-krug-event/index.ts'), 'utf-8');

const TYPES = [
  ['krug_override_proposed', 'override_proposed'],
  ['krug_override_confirmed', 'override_confirmed'],
  ['krug_override_rejected', 'override_rejected'],
] as const;

describe('krug override notification cycle', () => {
  it.each(TYPES)('%s je dozvoljen tip i mapira se na %s', (type, shortKey) => {
    expect(fn).toContain(`"${type}"`);
    expect(fn).toContain(`return "${shortKey}"`);
  });

  it.each(['hr', 'en', 'de'])('serverski katalog %s ima prijevode za sve short-keyeve', (lang) => {
    const cat = readFileSync(resolve(root, `supabase/functions/_shared/i18n/${lang}.ts`), 'utf-8');
    for (const [, shortKey] of TYPES) {
      expect(cat).toContain(`"notifications.krug.${shortKey}.title"`);
      expect(cat).toContain(`"notifications.krug.${shortKey}.message"`);
    }
  });

  it.each(['hr', 'en', 'de'])('master rječnik %s ima prijevode za sve short-keyeve', (lang) => {
    const master = JSON.parse(
      readFileSync(resolve(root, `src/i18n/locales/${lang}.json`), 'utf-8'),
    ) as any;
    for (const [, shortKey] of TYPES) {
      expect(master.notifications.krug[shortKey]?.title).toBeTruthy();
      expect(master.notifications.krug[shortKey]?.message).toBeTruthy();
    }
  });

  it('odbijanje prenosi razlog kroz vars', () => {
    const hr = readFileSync(resolve(root, 'supabase/functions/_shared/i18n/hr.ts'), 'utf-8');
    expect(hr).toMatch(/notifications\.krug\.override_rejected\.message.*\{\{reason\}\}/);
  });
});
