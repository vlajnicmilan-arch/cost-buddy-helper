/**
 * Krug presets — UI-side resolver za wizard + dodavanje članova.
 *
 * Backend enum `krug_preset` (vidi T1 migraciju) sadrži više vrijednosti
 * (`partner | su_roditelj | cimer | putovanje | projekt | klub`), ali ovaj
 * skoupj UI-a izlaže samo prva tri preseta. Ostali enum valueovi su rezervirani
 * za buduće valove i NE smiju biti odabirljivi iz create flow-a v1.
 *
 * Capovi (`maxPunopravni`) su UX guard, NE backend constraint. Klijent ih
 * koristi za disable add-member gumba; stvarna granica se ne potvrđuje na DB
 * razini dok ne donesemo Foundation odluku.
 *
 * Owner je UVIJEK i punopravni član (Krug Foundation v4.2 invarijanta).
 * Cap se broji preko membership reda `role='punopravni'` koji uključuje ownera.
 */
export type KrugPresetUiKey = 'partner' | 'su_roditelj' | 'cimer';

export interface KrugPresetSpec {
  /** Enum vrijednost u DB. */
  key: KrugPresetUiKey;
  /** i18n ključ za prikaz imena preseta. */
  i18nKey: string;
  /** Maks. broj `punopravni` članova (uključuje ownera). */
  maxPunopravni: number;
}

export const KRUG_PRESETS: KrugPresetSpec[] = [
  { key: 'partner', i18nKey: 'krug.preset.partner', maxPunopravni: 2 },
  { key: 'su_roditelj', i18nKey: 'krug.preset.su_roditelj', maxPunopravni: 2 },
  { key: 'cimer', i18nKey: 'krug.preset.cimer', maxPunopravni: 6 },
];

const PRESET_MAP: Record<KrugPresetUiKey, KrugPresetSpec> = Object.fromEntries(
  KRUG_PRESETS.map((p) => [p.key, p]),
) as Record<KrugPresetUiKey, KrugPresetSpec>;

export function getKrugPresetSpec(key: string | null | undefined): KrugPresetSpec | null {
  if (!key) return null;
  return (PRESET_MAP as any)[key] ?? null;
}

/**
 * Vraća true kada se može dodati još jedan `punopravni` član za zadani preset.
 * Cap inkluzivan (uključuje ownera). Ako preset nije u UI skoupu (npr. backend
 * `putovanje`), vraćamo `true` jer cap ne diktiramo ovdje.
 */
export function canAddPunopravni(
  preset: string | null | undefined,
  currentPunopravniCount: number,
): boolean {
  const spec = getKrugPresetSpec(preset);
  if (!spec) return true;
  return currentPunopravniCount < spec.maxPunopravni;
}
