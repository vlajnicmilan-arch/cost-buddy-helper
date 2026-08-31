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
import { describe, it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 60000 });
import { EXPORT_REGISTRY, SCOPES } from '@/lib/export/exportRegistry';

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function rpc(name: string): Promise<any[]> {
  // PostgREST vraća najviše 1000 redaka bez Range zaglavlja — stranicamo.
  const out: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const page = await rpcPage(name, PAGE, offset);
    out.push(...page);
    if (page.length < PAGE) return out;
  }
  throw new Error(`${name}: previše redaka, stranicanje ne staje`);
}

async function rpcPage(name: string, limit: number, offset: number): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}?limit=${limit}&offset=${offset}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`${name} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as any[];
}

/** SVE relacije sheme `public` — tablice I pogledi. Novi pogled s korisnikovim
 *  podacima mora pasti na branu, ne proći nezapaženo. */
async function liveTables(): Promise<string[]> {
  const rows = (await rpc('list_public_relations')) as { relname: string }[];
  return rows.map((r) => r.relname).sort();
}

let columnsCache: Promise<Map<string, Set<string>>> | null = null;
function liveColumns(): Promise<Map<string, Set<string>>> {
  if (!columnsCache) columnsCache = loadColumns();
  return columnsCache;
}

async function loadColumns(): Promise<Map<string, Set<string>>> {
  const rows = (await rpc('list_public_columns')) as { relname: string; column_name: string }[];
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.relname)) map.set(r.relname, new Set());
    map.get(r.relname)!.add(r.column_name);
  }
  return map;
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

describe('izvoz podataka — pravila pokazuju na stvarne stupce', () => {
  const columnsOfRule = (rule: any): string[] => {
    if (rule.via === 'column') return [rule.column];
    if (rule.via === 'orColumns') return rule.columns;
    if (rule.via === 'scope') return [rule.column];
    if (rule.via === 'union') return rule.rules.flatMap(columnsOfRule);
    return [];
  };

  it('svaki stupac iz pravila postoji u živoj shemi', async () => {
    const cols = await liveColumns();
    const bad: string[] = [];
    for (const [table, entry] of Object.entries(EXPORT_REGISTRY)) {
      if (entry.rule.via === 'excluded') continue;
      const readTable = entry.readFrom ?? table;
      const have = cols.get(readTable);
      if (!have) {
        bad.push(`${readTable}: relacija ne postoji`);
        continue;
      }
      for (const c of columnsOfRule(entry.rule)) {
        if (!have.has(c)) bad.push(`${readTable}.${c}`);
      }
      for (const c of entry.redact ?? []) {
        if (!have.has(c)) bad.push(`${readTable}.${c} (redact)`);
      }
    }
    expect(bad, `Pravila pokazuju na nepostojeće stupce: ${bad.join(', ')}`).toEqual([]);
  });

  it('skupovi roditelja pokazuju na stvarne stupce', async () => {
    const cols = await liveColumns();
    const bad: string[] = [];
    for (const [name, def] of Object.entries(SCOPES)) {
      const have = cols.get(def.table);
      if (!have) { bad.push(`${name}: ${def.table} ne postoji`); continue; }
      if (!have.has(def.idColumn)) bad.push(`${name}: ${def.table}.${def.idColumn}`);
      if (def.rule.via === 'column' && !have.has(def.rule.column)) bad.push(`${name}: ${def.table}.${def.rule.column}`);
      if (def.rule.via === 'scope' && !have.has(def.rule.column)) bad.push(`${name}: ${def.table}.${def.rule.column}`);
    }
    expect(bad, `Skupovi pokazuju na nepostojeće stupce: ${bad.join(', ')}`).toEqual([]);
  });

  it('mirrorOf pokazuje na tablicu koja se stvarno izvozi', () => {
    const bad = Object.entries(EXPORT_REGISTRY)
      .filter(([, v]) => v.mirrorOf)
      .filter(([, v]) => !EXPORT_REGISTRY[v.mirrorOf!] || EXPORT_REGISTRY[v.mirrorOf!].rule.via === 'excluded')
      .map(([k]) => k);
    expect(bad).toEqual([]);
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
