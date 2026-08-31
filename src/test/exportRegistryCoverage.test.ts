/**
 * BRANA: popis za izvoz podataka mora pokrivati ŽIVU shemu.
 *
 * Test čita imena tablica iz baze u trenutku pokretanja (RPC
 * `public.list_public_relations`, vraća samo imena — nikakve podatke) i pada
 * čim se pojavi tablica koja nije ni pokrivena ni izričito isključena, ili
 * kad registar spominje tablicu koje više nema.
 *
 * NAMJERNO NEMA ZAMRZNUTOG SNIMKA SHEME — upravo je snimak dopustio da
 * pokrivenost brisanja računa ostane zelena dok je stvarnost otišla dalje.
 * Ako baza nije dostupna, test PADA; ne preskače se.
 */
import { describe, it, expect } from 'vitest';
import { EXPORT_REGISTRY, SCOPES } from '@/lib/export/exportRegistry';

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function liveTables(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_public_relations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`list_public_relations failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as { relname: string }[];
  return rows.map((r) => r.relname).sort();
}

describe('izvoz podataka — pokrivenost registra', () => {
  it('svaka tablica u živoj shemi je pokrivena ili izričito isključena', async () => {
    const tables = await liveTables();
    expect(tables.length).toBeGreaterThan(50);

    const missing = tables.filter((t) => !(t in EXPORT_REGISTRY));
    expect(
      missing,
      `Nove tablice bez odluke u exportRegistry.ts — dodaj pravilo vlasništva ili izričito isključenje s razlogom: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('registar ne spominje tablice kojih više nema', async () => {
    const tables = new Set(await liveTables());
    const stale = Object.keys(EXPORT_REGISTRY).filter((t) => !tables.has(t));
    expect(stale, `Registar spominje nepostojeće tablice: ${stale.join(', ')}`).toEqual([]);
  });

  it('roditeljske tablice iz skupova postoje u shemi', async () => {
    const tables = new Set(await liveTables());
    const bad = Object.values(SCOPES)
      .map((s) => s.table)
      .filter((t) => !tables.has(t));
    expect(bad, `Skupovi pokazuju na nepostojeće tablice: ${bad.join(', ')}`).toEqual([]);
  });
});

describe('izvoz podataka — integritet registra', () => {
  it('svako isključenje ima razlog', () => {
    const noReason = Object.entries(EXPORT_REGISTRY)
      .filter(([, v]) => v.rule.via === 'excluded' && !(v.rule as any).reason?.trim())
      .map(([k]) => k);
    expect(noReason).toEqual([]);
  });

  it('svako pravilo preko roditelja pokazuje na definiran skup', () => {
    const bad = Object.entries(EXPORT_REGISTRY)
      .filter(([, v]) => v.rule.via === 'scope' && !SCOPES[(v.rule as any).scope])
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('tablice koje služe kao roditelj i same su izvezene ili to ne moraju biti', () => {
    // Roditelj mora imati pravilo (ne smije biti izvan registra).
    const orphan = Object.values(SCOPES)
      .map((s) => s.table)
      .filter((t) => !(t in EXPORT_REGISTRY));
    expect(orphan).toEqual([]);
  });
});
