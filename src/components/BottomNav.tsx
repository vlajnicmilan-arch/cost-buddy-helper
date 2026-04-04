import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Target, Wallet, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAppState } from '@/contexts/AppStateContext';
import { useHaptics } from '@/hooks/useHaptics';

const allNavItems = [
  { path: '/home', icon: LayoutDashboard, labelKey: 'nav.dashboard', fallback: 'Pregled', activePaths: ['/home', '/dashboard'] },
  { path: '/projects', icon: FolderKanban, labelKey: 'nav.projects', fallback: 'Projekti', activePaths: ['/projects'] },
  { path: '/budgets', icon: Target, labelKey: 'nav.budgets', fallback: 'Budžeti', activePaths: ['/budgets'] },
  { path: '/wallet', icon: Wallet, labelKey: 'nav.wallet', fallback: 'Novčanik', activePaths: ['/wallet'] },
  { path: '/family', icon: Users, labelKey: 'nav.family', fallback: 'Obitelj', activePaths: ['/family'] },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { familyModeEnabled, activeBusinessProfileId } = useAppState();
  const { lightTap } = useHaptics();

  const navItems = allNavItems.filter(item => {
    if (item.path === '/family') return familyModeEnabled && !activeBusinessProfileId;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = item.activePaths.includes(location.pathname);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
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
