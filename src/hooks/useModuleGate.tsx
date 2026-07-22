/**
 * useModuleGate — jedinstveni izvor za sve ulaze u zaključane module.
 *
 * Bilo koji entry (BottomNav, Home tile, deep link, quick action, empty
 * state CTA) mora ići kroz `requestModule(module, opts?)`. Ako korisnik
 * NEMA pravo → otvara se ModuleUpgradeDialog (cijena + Otključaj +
 * Isprobaj 30 dana + Ne sada). Ako IMA pravo → poziva `onGranted`
 * (default: navigate na route).
 *
 * "Ne sada" nikad ne pokazuje tehničku grešku i uvijek radi tihi
 * fallback (default: navigate na `/home`).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModuleUpgradeDialog, type UpgradeModule } from '@/components/modules/ModuleUpgradeDialog';
import { useFeatureAccess, type Feature } from '@/hooks/useFeatureAccess';

type GateModule = UpgradeModule; // 'krug' | 'projects' | 'business'

const MODULE_FEATURE: Record<GateModule, Feature> = {
  krug: 'krug',
  projects: 'projects',
  business: 'business_module',
};

interface RequestOpts {
  /** Poziva se ako korisnik već ima pravo. Default: no-op. */
  onGranted?: () => void;
  /** Poziva se ako korisnik zatvori dijalog bez otključavanja. Default: no-op. */
  onDismiss?: () => void;
  /** Ako je true, korisnik s pravom preskače dialog i odmah dobiva onGranted. */
  skipIfGranted?: boolean;
}

interface Ctx {
  requestModule: (module: GateModule, opts?: RequestOpts) => void;
  /** Otvara dijalog neovisno o pravima (npr. za "Saznaj više" akcije). */
  openUpgrade: (module: GateModule, opts?: Pick<RequestOpts, 'onDismiss'>) => void;
}

const ModuleGateContext = createContext<Ctx | null>(null);

export function ModuleGateProvider({ children }: { children: ReactNode }) {
  const { hasAccess } = useFeatureAccess();
  const [state, setState] = useState<{ open: boolean; module: GateModule }>({ open: false, module: 'krug' });
  const dismissRef = useRef<() => void>(() => {});

  const openUpgrade = useCallback<Ctx['openUpgrade']>((module, opts) => {
    dismissRef.current = opts?.onDismiss ?? (() => {});
    setState({ open: true, module });
  }, []);

  const requestModule = useCallback<Ctx['requestModule']>((module, opts) => {
    const feature = MODULE_FEATURE[module];
    if (hasAccess(feature)) {
      opts?.onGranted?.();
      return;
    }
    dismissRef.current = opts?.onDismiss ?? (() => {});
    setState({ open: true, module });
  }, [hasAccess]);

  const onOpenChange = useCallback((open: boolean) => {
    setState((s) => ({ ...s, open }));
    if (!open) {
      const cb = dismissRef.current;
      dismissRef.current = () => {};
      // Odgoda za smooth dialog close animaciju.
      queueMicrotask(() => cb?.());
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ requestModule, openUpgrade }), [requestModule, openUpgrade]);

  return (
    <ModuleGateContext.Provider value={value}>
      {children}
      <ModuleUpgradeDialog
        open={state.open}
        onOpenChange={onOpenChange}
        module={state.module}
      />
    </ModuleGateContext.Provider>
  );
}

export function useModuleGate(): Ctx {
  const ctx = useContext(ModuleGateContext);
  if (!ctx) {
    // Fallback: tiho no-op umjesto crasha ako ProviderHost nije mountan
    // (npr. u testovima). Nikad ne otvara dijalog i nikad ne baca grešku.
    return {
      requestModule: (_m, opts) => opts?.onDismiss?.(),
      openUpgrade: (_m, opts) => opts?.onDismiss?.(),
    };
  }
  return ctx;
}
