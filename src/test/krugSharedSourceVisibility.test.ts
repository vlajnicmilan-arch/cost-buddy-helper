/**
 * Guard: Krug Shared Source display + realtime workstream.
 *
 * 1) `useKrugSharedPaymentSources` mora zvati SECURITY DEFINER RPC
 *    `get_krug_shared_source_display` i eksponirati `displayById` mapu.
 *    Bez toga non-owner članovi kruga vide UUID token umjesto imena.
 * 2) Hook mora subscribati postgres_changes na `krug_shared_payment_source`
 *    filtriran po `krug_id`. Bez toga drugi članovi ne vide novi shared source
 *    dok ručno ne osvježe app.
 * 3) `KrugSharedSourcesSection` mora koristiti `displayById` iz hooka
 *    (a ne isključivo `useCustomPaymentSources`) — inače non-owner
 *    fallbacka na "Izvor · xxxxxx".
 * 4) Migracija mora dodati tablicu u `supabase_realtime` publikaciju
 *    i definirati RPC.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const HOOK = 'src/hooks/useKrugSharedPaymentSources.ts';
const COMPONENT = 'src/components/krug/KrugSharedSourcesSection.tsx';

describe('Krug Shared Source visibility & name resolution', () => {
  it('hook calls display RPC and exposes displayById', () => {
    const src = readFileSync(join(process.cwd(), HOOK), 'utf8');
    expect(src).toMatch(/get_krug_shared_source_display/);
    expect(src).toMatch(/displayById/);
  });

  it('hook subscribes to realtime on krug_shared_payment_source per krug_id', () => {
    const src = readFileSync(join(process.cwd(), HOOK), 'utf8');
    expect(src).toMatch(/postgres_changes/);
    expect(src).toMatch(/table:\s*'krug_shared_payment_source'/);
    expect(src).toMatch(/filter:\s*`krug_id=eq\.\$\{krugId\}`/);
  });

  it('component uses displayById from hook for label resolution', () => {
    const src = readFileSync(join(process.cwd(), COMPONENT), 'utf8');
    expect(src).toMatch(/displayById/);
  });

  it('migration adds table to realtime publication and defines display RPC', () => {
    const files = execSync(
      "grep -rl 'get_krug_shared_source_display' supabase/migrations/ || true",
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    const combined = files.map(f => readFileSync(f, 'utf8')).join('\n');
    expect(combined).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.krug_shared_payment_source/);
    expect(combined).toMatch(/CREATE OR REPLACE FUNCTION public\.get_krug_shared_source_display/);
    expect(combined).toMatch(/krug_is_member/);
  });
});
