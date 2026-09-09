/**
 * Admin — prava po modulu (jedan izvor istine: `user_entitlements`).
 *
 * Klijent (check-subscription → entitlements) i RLS (`has_entitlement`)
 * čitaju ISTU tablicu. Admin sučelje zato uključuje/isključuje redak u
 * `user_entitlements` sa `source='admin_grant'`, nikad više stari tier.
 *
 * Ovdje žive SAMO čiste funkcije — bez Supabase/React ovisnosti.
 */

export const ADMIN_ENTITLEMENT_MODULES = [
  'smjer',
  'krug',
  'projekti',
  'biznis',
  'mail_uvoz',
] as const;

export type AdminEntitlementModule = (typeof ADMIN_ENTITLEMENT_MODULES)[number];

/** Izvori koje prikazujemo uz prekidač. */
export type EntitlementSource = 'paddle' | 'trial' | 'admin_grant' | 'legacy' | 'other';

export interface EntitlementRowLike {
  module: string;
  source: string | null;
  status: string;
  period_end: string | null;
}

export interface ModuleEntitlementState {
  module: AdminEntitlementModule;
  /** Stvarno stanje iz `user_entitlements` (bez admin_module_grants legacy sloja). */
  active: boolean;
  source: EntitlementSource | null;
  period_end: string | null;
  /** Postoji li aktivan admin_grant redak (prekidač je "on" samo za taj sloj). */
  adminGrantActive: boolean;
  adminGrantExpiresAt: string | null;
}

const LEGACY_MODULES = new Set(['pro_legacy', 'business_legacy']);
const LEGACY_UNLOCKS = new Set(['smjer', 'krug', 'projekti']);

export function normalizeSource(source: string | null | undefined): EntitlementSource | null {
  if (!source) return null;
  if (source === 'paddle') return 'paddle';
  if (source === 'trial') return 'trial';
  if (source === 'admin_grant') return 'admin_grant';
  if (source === 'pro_legacy' || source === 'business_legacy' || source === 'migration') {
    return 'legacy';
  }
  return 'other';
}

function isRowActive(row: EntitlementRowLike, now: Date): boolean {
  if (row.status !== 'active') return false;
  if (!row.period_end) return true;
  return new Date(row.period_end).getTime() > now.getTime();
}

const SOURCE_RANK: Record<EntitlementSource, number> = {
  paddle: 4,
  admin_grant: 3,
  legacy: 2,
  trial: 1,
  other: 0,
};

/**
 * Izvodi prikazno stanje jednog modula iz sirovih redaka. Prati istu
 * semantiku kao `has_entitlement` za direktne i legacy retke; legacy
 * `admin_module_grants` sloj se prikazuje odvojeno (postojeći UI).
 */
export function deriveModuleState(
  rows: EntitlementRowLike[],
  module: AdminEntitlementModule,
  now: Date = new Date(),
): ModuleEntitlementState {
  const activeRows = rows.filter((r) => isRowActive(r, now));

  const direct = activeRows.filter((r) => r.module === module);
  const legacy = LEGACY_UNLOCKS.has(module)
    ? activeRows.filter((r) => LEGACY_MODULES.has(r.module))
    : [];

  const candidates = [...direct, ...legacy].sort(
    (a, b) =>
      SOURCE_RANK[normalizeSource(b.source) ?? 'other'] -
      SOURCE_RANK[normalizeSource(a.source) ?? 'other'],
  );

  const best = candidates[0] ?? null;
  const adminRow = direct.find((r) => r.source === 'admin_grant') ?? null;

  return {
    module,
    active: candidates.length > 0,
    source: best ? normalizeSource(best.source) : null,
    period_end: best?.period_end ?? null,
    adminGrantActive: !!adminRow,
    adminGrantExpiresAt: adminRow?.period_end ?? null,
  };
}

export interface SetEntitlementRequest {
  userId: string;
  module: AdminEntitlementModule;
  enabled: boolean;
  /** `YYYY-MM-DD` iz date inputa ili prazno/null za trajno. */
  expiresAt?: string | null;
}

export interface SetEntitlementPayload {
  user_id: string;
  module: AdminEntitlementModule;
  enabled: boolean;
  period_end: string | null;
}

/** Datum isteka iz `<input type="date">` → ISO kraj tog dana (UTC). */
export function expiryToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.000Z`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function buildSetEntitlementPayload(req: SetEntitlementRequest): SetEntitlementPayload {
  return {
    user_id: req.userId,
    module: req.module,
    enabled: req.enabled,
    period_end: req.enabled ? expiryToIso(req.expiresAt ?? null) : null,
  };
}

/** i18n ključ naziva modula (isti nazivi kao u paywallu). */
export function moduleLabelKey(module: AdminEntitlementModule): string {
  return `modules.name.${module}`;
}

/** i18n ključ izvora prava. */
export function entitlementSourceLabelKey(source: EntitlementSource): string {
  return `admin.entitlements.source.${source}`;
}
