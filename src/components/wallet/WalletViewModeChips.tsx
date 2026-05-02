import { useTranslation } from 'react-i18next';
import { Briefcase, User, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWalletViewMode, WalletViewMode } from '@/contexts/WalletViewModeContext';

interface WalletViewModeChipsProps {
  className?: string;
  /** Hide the "All" chip on contexts where it does not apply */
  hideAll?: boolean;
}

export const WalletViewModeChips = ({ className, hideAll }: WalletViewModeChipsProps) => {
  const { t } = useTranslation();
  const { mode, setMode } = useWalletViewMode();

  const items: Array<{ key: WalletViewMode; label: string; icon: typeof Layers }> = [
    ...(!hideAll ? [{ key: 'all' as WalletViewMode, label: t('wallet.viewMode.all', 'Sve'), icon: Layers }] : []),
    { key: 'personal', label: t('wallet.viewMode.personal', 'Osobno'), icon: User },
    { key: 'business', label: t('wallet.viewMode.business', 'Poslovno'), icon: Briefcase },
  ];

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
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
