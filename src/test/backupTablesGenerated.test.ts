/**
 * BRANA: popis tablica za tjednu kopiju mora biti generiran iz registra izvoza.
 *
 * Isti mehanizam kao exportRegistryCoverage: čim se registar promijeni, a
 * `supabase/functions/_shared/backupTables.ts` se ne regenerira
 * (`bun scripts/generate-backup-tables.mjs`), ovaj test pada.
 */
import { describe, it, expect } from 'vitest';
import { EXPORT_REGISTRY } from '@/lib/export/exportRegistry';
import {
  BACKUP_TABLES,
  BACKUP_OPERATIONAL_EXTRA,
} from '../../supabase/functions/_shared/backupTables';

function expected(): string[] {
  const fromRegistry = Object.keys(EXPORT_REGISTRY).filter(
    (t) => EXPORT_REGISTRY[t].rule.via !== 'excluded' && !EXPORT_REGISTRY[t].mirrorOf,
  );
  return Array.from(new Set([...fromRegistry, ...BACKUP_OPERATIONAL_EXTRA])).sort();
}

describe('tjedna kopija — popis tablica', () => {
  it('generirani popis odgovara registru izvoza', () => {
    expect(
      [...BACKUP_TABLES],
      'Registar i generirani popis se razilaze — pokreni: bun scripts/generate-backup-tables.mjs',
    ).toEqual(expected());
  });

  it('operativna iznimka su točno user_roles i app_settings', () => {
    expect([...BACKUP_OPERATIONAL_EXTRA].sort()).toEqual(['app_settings', 'user_roles']);
  });

  it('krug_act_dedup ostaje izvan kopije', () => {
    expect(BACKUP_TABLES).not.toContain('krug_act_dedup');
  });

  it('nema duplikata', () => {
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
  });
});
