/**
 * notifyModule — rezolucija modula za globalne obavijesti (CentarNote).
 *
 * Redoslijed:
 *  1. eksplicitni modul (prop iz poziva showSuccess/showError)
 *  2. `document.body.dataset.module` u trenutku poziva (postavlja ModuleThemeProvider)
 *  3. fallback 'centar' — neutralna/jantar grana (prazan dataset, neutralne rute
 *     /auth /settings /admin, globalne greške: network/offline/401/5xx)
 *
 * NULA hardkodiranih boja u komponentama: boje se čitaju iz MODULE_HSL,
 * a 'centar' ima vlastitu neutralnu (jantar) vrijednost usklađenu s Onyx zlatom.
 */
import { MODULE_HSL, MODULE_HSL_MUTED, type ModuleKey } from '@/lib/moduleColors';

export type NoteModule = ModuleKey | 'centar';

/** Neutralna (jantar) grana — koristi se kad modul nije poznat. */
const CENTAR_HSL = '40 55% 48%';
const CENTAR_HSL_MUTED = '40 45% 66%';

export const NOTE_MODULE_HSL: Record<NoteModule, string> = {
  ...MODULE_HSL,
  centar: CENTAR_HSL,
};

export const NOTE_MODULE_HSL_MUTED: Record<NoteModule, string> = {
  ...MODULE_HSL_MUTED,
  centar: CENTAR_HSL_MUTED,
};

const VALID: NoteModule[] = ['overview', 'projects', 'wallet', 'budgets', 'krug', 'centar'];

/** Rute koje su neutralne — nisu vezane uz modul. */
const NEUTRAL_PATH_PREFIXES = ['/auth', '/settings', '/admin'];

/** Globalne greške koje nisu vezane uz modul. */
const GLOBAL_ERROR_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network error/i,
  /offline/i,
  /\b401\b/,
  /\b5\d{2}\b/,
  /unauthorized/i,
];

export function isGlobalErrorMessage(message?: string): boolean {
  if (!message) return false;
  return GLOBAL_ERROR_PATTERNS.some((re) => re.test(message));
}

interface ResolveOptions {
  explicit?: NoteModule;
  message?: string;
  pathname?: string;
}

export function resolveNoteModule({ explicit, message, pathname }: ResolveOptions = {}): NoteModule {
  if (explicit && VALID.includes(explicit)) return explicit;

  if (isGlobalErrorMessage(message)) return 'centar';

  const path =
    pathname ?? (typeof window !== 'undefined' ? window.location?.pathname : undefined);
  if (path && NEUTRAL_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
    return 'centar';
  }

  const fromBody =
    typeof document !== 'undefined' ? document.body?.dataset?.module : undefined;
  if (fromBody && VALID.includes(fromBody as NoteModule)) return fromBody as NoteModule;

  return 'centar';
}

export function noteModuleHsl(module: NoteModule): string {
  return NOTE_MODULE_HSL[module] ?? NOTE_MODULE_HSL.centar;
}

export function noteModuleHslMuted(module: NoteModule): string {
  return NOTE_MODULE_HSL_MUTED[module] ?? NOTE_MODULE_HSL_MUTED.centar;
}
