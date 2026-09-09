/**
 * Odbijeni upis zbog neaktivnog modula (RLS `can_write_module` → 42501).
 *
 * Jedan izvor istine za mapiranje tablica → modul i za prepoznavanje
 * odbijenice. Bez React/Supabase ovisnosti (čisto, testabilno).
 */
import type { EntitlementModule } from '@/lib/featureModuleMap';
import type { UpgradeModule } from '@/components/modules/ModuleUpgradeDialog';

/** Tablice čiji WITH CHECK sadrži `can_write_module`. */
export const MODULE_WRITE_TABLES: Record<string, EntitlementModule> = {
  // smjer
  recurring_transactions: 'smjer',
  installment_plans: 'smjer',
  installments: 'smjer',
  savings_goals: 'smjer',
  custom_categories: 'smjer',
  // krug
  krug: 'krug',
  krug_membership: 'krug',
  krug_invitations: 'krug',
  // projekti
  projects: 'projekti',
  project_members: 'projekti',
  project_milestones: 'projekti',
  project_workers: 'projekti',
  project_collaborators: 'projekti',
  // biznis
  business_profiles: 'biznis',
  business_debts: 'biznis',
  business_premises: 'biznis',
  cash_registers: 'biznis',
  clients: 'biznis',
  inventory_items: 'biznis',
};

export const ENTITLEMENT_TO_GATE: Record<EntitlementModule, UpgradeModule> = {
  smjer: 'smjer',
  krug: 'krug',
  projekti: 'projects',
  biznis: 'business',
};

export interface PgErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** RLS odbijenica (42501) ili poruka o kršenju row-level policyja. */
export function isRlsDenied(error: PgErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42501') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('row-level security') || msg.includes('violates row-level security policy');
}

export function moduleForTable(table: string): EntitlementModule | null {
  return MODULE_WRITE_TABLES[table] ?? null;
}

export interface ModuleWriteDenial {
  table: string;
  module: EntitlementModule;
  gateModule: UpgradeModule;
  code: string | null;
  message: string | null;
}

/**
 * Vraća opis odbijenice ako je riječ o upisu u modulnu tablicu koji je RLS
 * odbio, inače `null` (pozivatelj tada nastavlja s vlastitom obradom).
 */
export function parseModuleWriteDenial(
  table: string,
  error: PgErrorLike | null | undefined,
): ModuleWriteDenial | null {
  if (!isRlsDenied(error)) return null;
  const module = moduleForTable(table);
  if (!module) return null;
  return {
    table,
    module,
    gateModule: ENTITLEMENT_TO_GATE[module],
    code: error?.code ?? null,
    message: error?.message ?? null,
  };
}

/** i18n ključ naziva modula (isti kao u admin sučelju). */
export function moduleNameKey(module: EntitlementModule): string {
  return `modules.name.${module}`;
}
