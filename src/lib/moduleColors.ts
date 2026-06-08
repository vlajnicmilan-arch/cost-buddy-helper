/**
 * Module Color System — jedan source-of-truth za 5 modula.
 *
 * 80% neutralno, 20% boja modula. Status boje (destructive/warning/income)
 * imaju prioritet i ne smiju se prebojati modulskom bojom.
 *
 * Strategija:
 *  - Tailwind klase za module-aware surface-e (CTA/badge/progress/empty)
 *    koriste statički token `bg-module` / `text-module` koji čita aktivnu
 *    `--module-accent` CSS varijablu. Varijablu postavlja
 *    `ModuleThemeProvider` na <body> na osnovu rute.
 *  - BottomNav (treba sve boje istovremeno) koristi statičku lookup mapu
 *    `MODULE_NAV_CLASSES` s literalnim arbitrary klasama — Tailwind JIT ih
 *    vidi u izvoru i ne razbijaju se kroz purge.
 */

export type ModuleKey = 'overview' | 'projects' | 'wallet' | 'budgets' | 'krug';

/** HSL vrijednosti (bez `hsl()` wrappera) — koristi se za CSS varijable. */
export const MODULE_HSL: Record<ModuleKey, string> = {
  overview: '172 66% 40%', // #21D4AE — već se poklapa s --primary (teal)
  projects: '217 91% 60%', // #3B82F6
  wallet: '142 71% 45%',   // #16A34A
  budgets: '258 90% 66%',  // #8B5CF6
  krug: '25 95% 53%',      // #F97316
};

/**
 * Mapiranje rute → modul. Provjereno u kodu:
 *  - /krug   → kanonska ruta Krug modula
 *  - /dashboard → alias za /home (BottomNav.activePaths)
 */
const ROUTE_TO_MODULE: Array<[string, ModuleKey]> = [
  // duže prefikse navedi prije kraćih
  ['/dashboard', 'overview'],
  ['/projects', 'projects'],
  ['/wallet', 'wallet'],
  ['/budgets', 'budgets'],
  ['/krug', 'krug'],
  ['/home', 'overview'],
];

export function resolveModuleFromPath(pathname: string): ModuleKey {
  for (const [prefix, key] of ROUTE_TO_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key;
  }
  return 'overview';
}

/**
 * Statičke literalne Tailwind klase po modulu — koristi ih SAMO BottomNav
 * (gdje moramo prikazati sve boje istovremeno). Ostatak app-a koristi
 * `bg-module` / `text-module` preko aktivnog tokena.
 */
export const MODULE_NAV_CLASSES: Record<ModuleKey, { text: string; bg: string }> = {
  overview: { text: 'text-[hsl(172_66%_40%)]', bg: 'bg-[hsl(172_66%_40%)]' },
  projects: { text: 'text-[hsl(217_91%_60%)]', bg: 'bg-[hsl(217_91%_60%)]' },
  wallet:   { text: 'text-[hsl(142_71%_45%)]', bg: 'bg-[hsl(142_71%_45%)]' },
  budgets:  { text: 'text-[hsl(258_90%_66%)]', bg: 'bg-[hsl(258_90%_66%)]' },
  krug:     { text: 'text-[hsl(25_95%_53%)]',  bg: 'bg-[hsl(25_95%_53%)]'  },
};
