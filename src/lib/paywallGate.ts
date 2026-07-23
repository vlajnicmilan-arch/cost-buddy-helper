/**
 * paywallGate — čiste odluke za Paywall exit/entry logiku.
 *
 * Pravila (Milan odobrio):
 *  - Prisilni gate izbacuje SAMO kad korisnik nema razloga biti tu
 *    (bez `?plan=` i bez `?shop=1` i bez `?checkout=success`).
 *  - Namjerna kupovina iz Postavke → Cjenik (`?shop=1`) ili iz
 *    ModuleUpgradeDialoga (`?plan=X`) drži korisnika na paywallu čak
 *    i kad već ima aktivne module.
 *  - Nakon `?checkout=success` izlazak je dopušten TEK kada se aktivira
 *    modul koji NIJE bio aktivan u trenutku ulaska (snapshot).
 *  - Trial prava ne broje se kao "paddle preklapanje" za Komplet upozorenje.
 */
export type PaywallModule = 'smjer' | 'krug' | 'projekti' | 'biznis';
export type PaywallPlan = 'smjer' | 'krug' | 'projekti' | 'komplet';

export interface EntitlementSnapshot {
  active: boolean;
  source: string | null;
}

export type EntitlementMap = Record<PaywallModule, EntitlementSnapshot>;

export interface PaywallIntent {
  plan: string | null;
  shop: boolean;
  checkoutSuccess: boolean;
}

/** Ima li korisnik ijedan aktivan modul (bilo koji source). */
export function hasAnyEntitlement(ents: EntitlementMap): boolean {
  return (['smjer', 'krug', 'projekti', 'biznis'] as PaywallModule[])
    .some((m) => !!ents[m]?.active);
}

/** Set aktivnih modula za brzu usporedbu snapshot ↔ trenutno. */
export function activeModuleSet(ents: EntitlementMap): Set<PaywallModule> {
  const s = new Set<PaywallModule>();
  (['smjer', 'krug', 'projekti', 'biznis'] as PaywallModule[]).forEach((m) => {
    if (ents[m]?.active) s.add(m);
  });
  return s;
}

/**
 * Prisilni gate: izbaci s /paywall na /home kad nema NIKAKVE namjere biti tu.
 * Namjera = `?plan=`, `?shop=1` ili tekući checkout success poll.
 */
export function shouldForceRedirectAway(
  intent: PaywallIntent,
  ents: EntitlementMap,
): boolean {
  if (intent.shop || intent.plan || intent.checkoutSuccess) return false;
  return hasAnyEntitlement(ents);
}

/**
 * Nakon checkout=success: izlaz je opravdan tek kad postoji BAREM JEDAN
 * modul aktivan sad kojeg NIJE bilo u snapshotu pri mountu.
 */
export function shouldExitOnCheckoutSuccess(
  initialSnapshot: EntitlementMap,
  current: EntitlementMap,
): boolean {
  const before = activeModuleSet(initialSnapshot);
  const now = activeModuleSet(current);
  for (const m of now) if (!before.has(m)) return true;
  return false;
}

/**
 * Komplet preklapanje: korisnik ima aktivnu PADDLE pretplatu na bilo koji
 * pojedinačni modul (smjer/krug/projekti) i pokušava kupiti Komplet.
 * Trial i admin_grant se NE broje kao preklapanje.
 */
export function needsKompletOverlapConfirm(
  plan: PaywallPlan,
  ents: EntitlementMap,
): boolean {
  if (plan !== 'komplet') return false;
  return (['smjer', 'krug', 'projekti'] as PaywallModule[]).some(
    (m) => ents[m]?.active && ents[m]?.source === 'paddle',
  );
}

/** Popis modula (za prikaz u dijalogu) koji se preklapaju s Kompletom. */
export function overlappingPaddleModules(ents: EntitlementMap): PaywallModule[] {
  return (['smjer', 'krug', 'projekti'] as PaywallModule[]).filter(
    (m) => ents[m]?.active && ents[m]?.source === 'paddle',
  );
}

/** Je li dana karta modul koji je korisniku već aktivan (bilo koji source). */
export function isPlanAlreadyActive(
  plan: PaywallPlan,
  ents: EntitlementMap,
): boolean {
  if (plan === 'komplet') {
    // Komplet je "aktivan" samo ako su sva tri pojedinačna modula aktivna.
    return (['smjer', 'krug', 'projekti'] as PaywallModule[]).every(
      (m) => !!ents[m]?.active,
    );
  }
  return !!ents[plan]?.active;
}
