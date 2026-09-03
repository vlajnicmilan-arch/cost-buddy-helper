import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { getNavVisibility, isModuleActive, type AppModule } from '@/lib/moduleVisibility';

const MODULES: AppModule[] = ['core', 'smjer', 'krug', 'projects', 'business'];

describe('ukinuti prekidači modula', () => {
  it('sve nav stavke su vidljive bez obzira na enabled/tier', () => {
    for (const m of MODULES) {
      expect(getNavVisibility(m, { enabled: false, tierUnlocked: false })).toBe('visible');
      expect(getNavVisibility(m, { enabled: true, tierUnlocked: true })).toBe('visible');
    }
  });

  it('pristup i dalje ovisi o pretplati', () => {
    expect(isModuleActive('projects', { enabled: true, tierUnlocked: false })).toBe(false);
    expect(isModuleActive('projects', { enabled: true, tierUnlocked: true })).toBe(true);
  });

  it('AppStateContext više ne izlaže prekidače modula', () => {
    const src = readFileSync('src/contexts/AppStateContext.tsx', 'utf8');
    expect(src).not.toMatch(/setKrugModeEnabled|setProjectsModuleEnabled|setBusinessFeatureEnabled/);
  });

  it('Settings više nema kartice modula s prekidačima', () => {
    const src = readFileSync('src/components/settings/ModulesSection.tsx', 'utf8');
    expect(src).not.toMatch(/module-krug|module-projects|module-business/);
  });
});
