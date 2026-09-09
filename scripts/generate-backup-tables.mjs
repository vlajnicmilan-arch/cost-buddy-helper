// Generira supabase/functions/_shared/backupTables.ts iz registra izvoza.
// Pokretanje: bun scripts/generate-backup-tables.mjs
// Brana protiv razilaženja: src/test/backupTablesGenerated.test.ts
import { writeFileSync } from 'node:fs';
import { EXPORT_REGISTRY } from '../src/lib/export/exportRegistry.ts';

// Operativna iznimka: kopija služi obnovi sustava, ne GDPR izvozu.
// Ove tablice su u registru isključene (nisu korisnikov sadržaj), ali bez njih
// se sustav ne može vjerodostojno obnoviti.
const OPERATIONAL_EXTRA = ['user_roles', 'app_settings'];

export function computeBackupTables(registry) {
  const fromRegistry = Object.keys(registry).filter(
    (t) => registry[t].rule.via !== 'excluded' && !registry[t].mirrorOf,
  );
  return Array.from(new Set([...fromRegistry, ...OPERATIONAL_EXTRA])).sort();
}

const tables = computeBackupTables(EXPORT_REGISTRY);

const out = `// GENERIRANO — ne uređivati ručno.
// Izvor: src/lib/export/exportRegistry.ts (sve tablice koje nisu 'excluded' i nisu mirrorOf)
// + operativna iznimka: user_roles, app_settings — kopija služi OBNOVI SUSTAVA,
// ne GDPR izvozu, pa uključuje i administrativne/interne tablice bez kojih se
// sustav ne može vjerodostojno vratiti. krug_act_dedup ostaje vani (interno).
// Regeneriraj: bun scripts/generate-backup-tables.mjs
export const BACKUP_TABLES: readonly string[] = [
${tables.map((t) => `  "${t}",`).join('\n')}
] as const;

export const BACKUP_OPERATIONAL_EXTRA: readonly string[] = ${JSON.stringify(OPERATIONAL_EXTRA)} as const;
`;

writeFileSync(new URL('../supabase/functions/_shared/backupTables.ts', import.meta.url), out);
console.log(`backupTables.ts: ${tables.length} tablica`);
