/**
 * Dohvat redaka koji pripadaju korisniku, strogo po `exportRegistry`.
 *
 * Nijedan neuspjeh se ne guta: svaki poziv vraća ili retke ili razlog pada,
 * koji izvoz upisuje u `manifest.json` i pokazuje korisniku.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  EXPORT_REGISTRY,
  SCOPES,
  type OwnerRule,
  type ScopeName,
  type TableRule,
} from './exportRegistry';

const PAGE_SIZE = 1000;
/** `in.(...)` ide u URL — dijelimo na komade da se ne probije duljina. */
const ID_CHUNK = 150;

export interface FetchOk {
  ok: true;
  rows: Record<string, unknown>[];
  via: string;
}

export interface FetchFail {
  ok: false;
  reason: string;
  code?: string;
}

export type FetchOutcome = FetchOk | FetchFail;

/** Eksplicitna straža — narrowing bez oslanjanja na diskriminantu. */
export const isFetchFail = (o: FetchOutcome): o is FetchFail => o.ok === false;

const describe = (error: { message?: string; code?: string; details?: string } | null): string => {
  if (!error) return 'Nepoznata greška';
  return [error.message, error.details].filter(Boolean).join(' — ') || 'Nepoznata greška';
};

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** Jedna stranicana pretraga s primijenjenim filtrom. */
async function paginate(
  table: string,
  select: string,
  applyFilter: (q: any) => any,
): Promise<FetchOutcome> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const query = applyFilter((supabase as any).from(table).select(select)).range(
      from,
      from + PAGE_SIZE - 1,
    );
    const { data, error } = await query;
    if (error) return { ok: false, reason: describe(error), code: error.code };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { ok: true, rows, via: '' };
}

export class OwnedDataReader {
  private scopeCache = new Map<ScopeName, Promise<string[] | { error: string }>>();

  constructor(private readonly userId: string) {}

  /** Skup id-eva roditelja (npr. „moji projekti"), memoiziran. */
  async resolveScope(name: ScopeName): Promise<string[] | { error: string }> {
    const cached = this.scopeCache.get(name);
    if (cached) return cached;
    const promise = this.loadScope(name);
    this.scopeCache.set(name, promise);
    return promise;
  }

  private async loadScope(name: ScopeName): Promise<string[] | { error: string }> {
    const def = SCOPES[name];
    const outcome: FetchOutcome = await this.fetchByRule(def.table, def.idColumn, def.rule);
    if (outcome.ok) {
      const ids = new Set<string>();
      for (const row of outcome.rows) {
        const value = row[def.idColumn];
        if (typeof value === 'string' && value) ids.add(value);
      }
      return Array.from(ids);
    }
    return { error: `${def.table}: ${(outcome as FetchFail).reason}` };
  }

  private async fetchByRule(table: string, select: string, rule: OwnerRule): Promise<FetchOutcome> {
    if (rule.via === 'excluded') return { ok: false, reason: rule.reason };

    if (rule.via === 'column') {
      return paginate(table, select, (q) => q.eq(rule.column, this.userId));
    }

    if (rule.via === 'orColumns') {
      const filter = rule.columns.map((c) => `${c}.eq.${this.userId}`).join(',');
      return paginate(table, select, (q) => q.or(filter));
    }

    if (rule.via === 'union') {
      const rows: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      const vias: string[] = [];
      for (const part of rule.rules) {
        const outcome = await this.fetchByRule(table, select, part);
        if (!outcome.ok) return outcome;
        vias.push(outcome.via);
        for (const row of outcome.rows) {
          const key = typeof row.id === 'string' ? row.id : JSON.stringify(row);
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(row);
        }
      }
      return { ok: true, rows, via: vias.filter(Boolean).join(' + ') };
    }

    // rule.via === 'scope'
    const ids = await this.resolveScope(rule.scope);
    if (!Array.isArray(ids)) return { ok: false, reason: `roditelj nedostupan (${ids.error})` };
    if (ids.length === 0) return { ok: true, rows: [], via: `${rule.scope}` };

    const rows: Record<string, unknown>[] = [];
    for (const part of chunk(ids, ID_CHUNK)) {
      const outcome = await paginate(table, select, (q) => q.in(rule.column, part));
      if (!outcome.ok) return outcome;
      rows.push(...outcome.rows);
    }
    return { ok: true, rows, via: `${rule.scope}` };
  }

  /** Dohvat cijele tablice iz registra. */
  async fetchTable(table: string): Promise<FetchOutcome> {
    const entry: TableRule | undefined = EXPORT_REGISTRY[table];
    if (!entry) return { ok: false, reason: 'Tablica nije u registru izvoza' };
    const outcome = await this.fetchByRule(entry.readFrom ?? table, '*', entry.rule);
    if (!outcome.ok) return outcome;
    const blank = entry.blankUnlessOwn;
    const rows =
      entry.redact?.length || blank
        ? outcome.rows.map((row) => {
            const copy = { ...row };
            entry.redact?.forEach((c) => {
              if (c in copy) delete copy[c];
            });
            if (blank && copy[blank.ownerColumn] !== this.userId) {
              blank.columns.forEach((c) => {
                if (c in copy) copy[c] = null;
              });
            }
            return copy;
          })
        : outcome.rows;

    const via =
      entry.rule.via === 'scope'
        ? `${entry.rule.column} → ${SCOPES[entry.rule.scope].table}`
        : entry.rule.via === 'orColumns'
          ? entry.rule.columns.join(' | ')
          : entry.rule.via === 'union'
            ? outcome.via
          : entry.rule.via === 'column'
            ? entry.rule.column
            : '';
    return { ok: true, rows, via };
  }
}
