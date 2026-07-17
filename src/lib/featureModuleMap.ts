/**
 * FAZA 5 — jedini izvor mapiranja UI feature → entitlement modul.
 *
 * PRAVILO: mapa mora odgovarati onome što JAVNI CJENIK obećava
 * (vmbalance.com/centar, Paywall.tsx). Ako se pojavi novi feature čije
 * mapiranje proturječi tekstu cjenika — STANI I JAVI, ne odlučuj sam.
 *
 * Odluke odobrio Milan (17.07.2026):
 *   - sharing → KRUG (cjenik Krug obećava "Zajedničke financije i obitelj").
 *   - team_access / collaborators / workforce / advanced_projects / projects
 *     → PROJEKTI (cjenik Projekti obećava "Radnici i satnice", "Odluke i suradnici").
 *   - Sve što je klasična osobna financija → SMJER.
 *   - business_module → BIZNIS.
 */

import type { Feature } from '@/hooks/useFeatureAccess';

export type EntitlementModule = 'smjer' | 'krug' | 'projekti' | 'biznis';

export const FEATURE_MODULE_MAP: Record<Feature, EntitlementModule> = {
  // ---- SMJER (osobne financije + AI + osnovna pomagala) ----
  unlimited_transactions: 'smjer',
  unlimited_payment_sources: 'smjer',
  unlimited_budgets: 'smjer',
  csv_import: 'smjer',
  pdf_import: 'smjer',
  reports: 'smjer',
  ai_assistant: 'smjer',
  recurring_transactions: 'smjer',
  savings_goals: 'smjer',
  installments: 'smjer',
  custom_categories: 'smjer',

  // ---- KRUG (dijeljene financije + obitelj) ----
  krug: 'krug',
  sharing: 'krug',

  // ---- PROJEKTI (radovi, radnici, suradnici, investitori) ----
  projects: 'projekti',
  advanced_projects: 'projekti',
  workforce: 'projekti',
  collaborators: 'projekti',
  team_access: 'projekti',

  // ---- BIZNIS (poslovni modul) ----
  business_module: 'biznis',
};

export function moduleForFeature(feature: Feature): EntitlementModule {
  return FEATURE_MODULE_MAP[feature];
}
