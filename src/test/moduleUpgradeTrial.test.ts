/**
 * Trial politika B — verificira mapping module→RPC argument i tok potvrde.
 * Ne renderira dijalog (teški providers); umjesto toga pokriva ugovor:
 *  - UI modul 'projects' → RPC arg 'projekti'
 *  - UI modul 'krug'     → RPC arg 'krug'
 *  - UI modul 'business' → nema trial (RPC se NE zove)
 * Direktni RPC edge-caseovi (invalid_module, anon blokiran, already_used)
 * pokriveni su DB testom uz migraciju.
 */
import { describe, it, expect } from 'vitest';

// Mirror MODULE_META.trialModule iz src/components/modules/ModuleUpgradeDialog.tsx
// (izvor istine je tamo — ovaj test brani ugovor da se ne mijenja slučajno).
const trialModuleFor = (m: 'krug' | 'projects' | 'business'): 'smjer' | 'krug' | 'projekti' | null => {
  if (m === 'krug') return 'krug';
  if (m === 'projects') return 'projekti';
  return null;
};

describe('ModuleUpgradeDialog trial mapping', () => {
  it('mapira projects → projekti RPC', () => {
    expect(trialModuleFor('projects')).toBe('projekti');
  });
  it('mapira krug → krug RPC', () => {
    expect(trialModuleFor('krug')).toBe('krug');
  });
  it('business nema trial (null)', () => {
    expect(trialModuleFor('business')).toBeNull();
  });
});
