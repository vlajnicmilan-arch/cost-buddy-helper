import { LayoutDashboard, ArrowLeftRight, FileBarChart, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export type BusinessTab = 'dashboard' | 'transactions' | 'reports' | 'more';

interface Props {
  activeTab: BusinessTab;
  onTabChange: (tab: BusinessTab) => void;
}

export const BusinessBottomNav = ({ activeTab, onTabChange }: Props) => {
  const { t } = useTranslation();

  const tabs = [
    { id: 'dashboard' as BusinessTab, icon: LayoutDashboard, label: t('business.nav.overview', 'Pregled') },
    { id: 'transactions' as BusinessTab, icon: ArrowLeftRight, label: t('business.nav.transactions', 'Transakcije') },
    { id: 'reports' as BusinessTab, icon: FileBarChart, label: t('business.nav.reports', 'Izvještaji') },
    { id: 'more' as BusinessTab, icon: MoreHorizontal, label: t('business.nav.more', 'Više') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/50 safe-area-bottom">
      <div className="max-w-4xl mx-auto flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="businessNavIndicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
