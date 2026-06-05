import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Target, Wallet, Circle } from 'lucide-react';
import { KrugBrandIcon } from '@/components/krug/KrugBrandIcon';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAppState } from '@/contexts/AppStateContext';
import { useModuleStates } from '@/hooks/useModuleStates';
import { getNavVisibility, type AppModule } from '@/lib/moduleVisibility';
import { useHaptics } from '@/hooks/useHaptics';
import { MODULE_NAV_CLASSES, type ModuleKey } from '@/lib/moduleColors';
import { cn } from '@/lib/utils';

type NavItem = {
  path: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  fallback: string;
  activePaths: string[];
  /** Modul koji kontrolira vidljivost stavke (core = uvijek vidljiv). */
  module: AppModule;
  /** Modul boja akcenta za aktivni tab (vidi `MODULE_NAV_CLASSES`). */
  colorKey: ModuleKey;
};

const ALL_NAV_ITEMS: NavItem[] = [
  { path: '/home', icon: LayoutDashboard, labelKey: 'nav.dashboard', fallback: 'Pregled', activePaths: ['/home', '/dashboard'], module: 'core', colorKey: 'overview' },
  { path: '/projects', icon: FolderKanban, labelKey: 'nav.projects', fallback: 'Projekti', activePaths: ['/projects'], module: 'projects', colorKey: 'projects' },
  { path: '/wallet', icon: Wallet, labelKey: 'nav.wallet', fallback: 'Novčanik', activePaths: ['/wallet'], module: 'core', colorKey: 'wallet' },
  { path: '/budgets', icon: Target, labelKey: 'nav.budgets', fallback: 'Budžeti', activePaths: ['/budgets'], module: 'core', colorKey: 'budgets' },
  // Krug zauzima slot bivšeg Obitelj taba (odluka 04.06.2026). Gating ostaje
  // preko `family` modula: tierUnlocked = plaćen paket. Legacy /family
  // ostaje dostupan kao ruta dok se ne odluči o migraciji, ali ne u nav-u.
  { path: '/krug', icon: Circle, labelKey: 'nav.krug', fallback: 'Krug', activePaths: ['/krug'], module: 'family', colorKey: 'krug' },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const modules = useModuleStates();
  const { lightTap } = useHaptics();

  // Faza 1 modularnog UI-a: jedini izvor istine za nav stavke je
  // getNavVisibility(). Krug se dodatno sakriva u business kontekstu
  // (kontekst-specifična navigacija, ne modul gate) — mirror legacy obiteljskog
  // ponašanja u v1.
  const navItems = ALL_NAV_ITEMS.filter(item => {
    if (getNavVisibility(item.module, modules[item.module]) !== 'visible') return false;
    if (item.path === '/krug' && activeBusinessProfileId) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = item.activePaths.includes(location.pathname);
          const Icon = item.icon;
          const accent = MODULE_NAV_CLASSES[item.colorKey];
          return (
            <button
              key={item.path}
              onClick={() => { lightTap(); navigate(item.path); }}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className={cn('absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full', accent.bg)}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              {item.path === '/krug' ? (
                <KrugBrandIcon size={20} className="transition-opacity" />
              ) : (
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    isActive ? accent.text : 'text-muted-foreground',
                  )}
                />
              )}

              <span
                className={cn(
                  'text-[10px] font-medium transition-colors',
                  isActive ? accent.text : 'text-muted-foreground',
                )}
              >
                {t(item.labelKey, item.fallback)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
