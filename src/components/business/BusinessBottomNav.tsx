import { LayoutDashboard, ArrowLeftRight, FileBarChart, MoreHorizontal, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type BusinessTab = 'dashboard' | 'wallet' | 'transactions' | 'reports' | 'more';

interface Props {
  activeTab: BusinessTab;
  onTabChange: (tab: BusinessTab) => void;
}

export const BusinessBottomNav = ({ activeTab, onTabChange }: Props) => {
  const { t } = useTranslation();

  const tabs = [
    { id: 'dashboard' as BusinessTab, icon: LayoutDashboard, label: t('business.nav.overview', 'Pregled') },
    { id: 'wallet' as BusinessTab, icon: Wallet, label: t('business.nav.wallet', 'Novčanik') },
    { id: 'transactions' as BusinessTab, icon: ArrowLeftRight, label: t('business.nav.transactions', 'Transakcije') },
    { id: 'reports' as BusinessTab, icon: FileBarChart, label: t('business.nav.reports', 'Izvještaji') },
    { id: 'more' as BusinessTab, icon: MoreHorizontal, label: t('business.nav.more', 'Više') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="max-w-4xl mx-auto flex items-center h-14 px-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 mx-0.5 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-[18px] h-[18px] transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className={`text-[9px] font-semibold tracking-wide uppercase ${isActive ? '' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
