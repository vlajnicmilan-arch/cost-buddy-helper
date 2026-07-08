import { useTranslation } from 'react-i18next';
import { Briefcase, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWalletViewMode, WalletViewMode } from '@/contexts/WalletViewModeContext';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { useAppState } from '@/contexts/AppStateContext';

interface WalletViewModeChipsProps {
  className?: string;
}

export const WalletViewModeChips = ({ className }: WalletViewModeChipsProps) => {
  const { t } = useTranslation();
  const { mode, setMode } = useWalletViewMode();
  const { profiles } = useBusinessProfiles();
  const { businessModeEnabled } = useAppState();

  type Item = { key: WalletViewMode; label: string; icon: typeof User };
  const items: Item[] = [
    { key: 'personal' as WalletViewMode, label: t('wallet.viewMode.personal', 'Osobno'), icon: User },
    ...profiles.map<Item>(p => ({
      key: `business:${p.id}` as WalletViewMode,
      label: p.name,
      icon: Briefcase,
    })),
  ];

  // Hide chips entirely when business mode is disabled in Settings, or no profiles exist.
  if (!businessModeEnabled || items.length <= 1) return null;

  return (
    <div className={cn('flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1', className)}>
      {items.map(({ key, label, icon: Icon }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium transition-colors shrink-0 min-h-[36px]',
              active
                ? 'bg-module/10 text-module border border-module/30 shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="truncate max-w-[140px]">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
