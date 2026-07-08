/**
 * ModuleThemeProvider — postavlja `--module-accent` (+ muted varijantu) na
 * <body> prema ruti.
 *
 * Bez konteksta, bez re-rendera djece: samo side-effect. Komponente koje
 * žele aktivnu modulsku boju koriste statičke klase `bg-module` /
 * `text-module` / `text-module-muted` / `bg-module/10` / `border-module/20`
 * koje preko Tailwind konfiguracije čitaju aktivnu CSS varijablu.
 * Fokus ring unutar modula preusmjerava se preko `body[data-module]`
 * override-a u index.css (`--ring: var(--module-accent)`).
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MODULE_HSL, MODULE_HSL_MUTED, resolveModuleFromPath } from '@/lib/moduleColors';

export function ModuleThemeProvider() {
  const location = useLocation();

  useEffect(() => {
    const key = resolveModuleFromPath(location.pathname);
    const body = document.body;
    body.dataset.module = key;
    body.style.setProperty('--module-accent', MODULE_HSL[key]);
    body.style.setProperty('--module-accent-foreground', '0 0% 100%');
    body.style.setProperty('--module-accent-muted', MODULE_HSL_MUTED[key]);
  }, [location.pathname]);

  return null;
}
