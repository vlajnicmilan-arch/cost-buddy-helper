/**
 * Single source of truth for module UI visibility.
 *
 * Faza 1 modularnog UI razdvajanja: BottomNav, Settings → Moduli i Core
 * cross-cut entry pointi konzultiraju ove helpere umjesto da raspršeno
 * miješaju subscription tier + localStorage flagove.
 *
 * Ovo je samo UI sloj — billing (tier provjera, paywall redirect) ostaje
 * u `useFeatureAccess` / `useSubscription` i NE smije se duplicirati ovdje.
 */

export type AppModule = 'core' | 'krug' | 'projects' | 'business';

export type ModuleVisibility = 'visible' | 'hidden' | 'locked';
export type SettingsCardState = 'active' | 'inactive' | 'locked';

export interface ModuleState {
  /** Korisnik je eksplicitno uključio modul (toggle u Settings). Core = uvijek true. */
  enabled: boolean;
  /** Pretplata dopušta korištenje modula (tier check). Core = uvijek true. */
  tierUnlocked: boolean;
}

/**
 * Je li modul "aktivan" — user ga je uključio AND tier dopušta.
 * Koristi se kao guard za cross-cut UI fragmente (project picker u
 * AddExpense, family split controls itd.).
 */
export function isModuleActive(module: AppModule, state: ModuleState): boolean {
  if (module === 'core') return true;
  return state.enabled && state.tierUnlocked;
}

/**
 * Visibility za BottomNav stavku.
 * Pravilo: ako modul nije enabled → 'hidden'. Tier gate NIJE briga
 * nav helpera — locked moduli ostaju skriveni iz nav-a; nadogradnja se
 * nudi u Settings → Moduli.
 */
export function getNavVisibility(module: AppModule, state: ModuleState): ModuleVisibility {
  if (module === 'core') return 'visible';
  if (!state.enabled) return 'hidden';
  return 'visible';
}

/**
 * State kartice u Settings → Moduli.
 *  - 'locked'   = tier nedovoljan; prikaži upgrade CTA
 *  - 'active'   = user je uključio i tier dopušta
 *  - 'inactive' = tier dopušta, ali user je isključen
 */
export function getSettingsCardState(module: AppModule, state: ModuleState): SettingsCardState {
  if (module === 'core') return 'active';
  if (!state.tierUnlocked) return 'locked';
  return state.enabled ? 'active' : 'inactive';
}
