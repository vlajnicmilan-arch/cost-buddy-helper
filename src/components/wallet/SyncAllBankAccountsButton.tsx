import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncAllBankAccounts } from '@/hooks/useSyncAllBankAccounts';

/**
 * "Sinkroniziraj sve" gumb za vrh Wallet-a.
 * Vidljiv samo ako korisnik ima ≥1 bank account u trenutnom kontekstu.
 * Stanja: idle / all-cooldown (disabled + countdown) / in-progress (spinner + N/Total).
 */
export const SyncAllBankAccountsButton = () => {
  const { t } = useTranslation();
  const { hasAccounts, allCooldown, nextAvailableLabel, isRunning, progress, run } =
    useSyncAllBankAccounts();

  if (!hasAccounts) return null;

  let label: string;
  if (isRunning) {
    label = t('wallet.syncAll.inProgress', {
      current: progress?.current ?? 0,
      total: progress?.total ?? 0,
    });
  } else if (allCooldown) {
    label = t('wallet.syncAll.nextIn', { duration: nextAvailableLabel });
  } else {
    label = t('wallet.syncAll.button', 'Sinkroniziraj sve');
  }

  const disabled = isRunning || allCooldown;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={disabled}
      className="shrink-0 min-h-11"
      aria-busy={isRunning || undefined}
    >
      {isRunning ? (
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4 mr-1.5" />
      )}
      {label}
    </Button>
  );
};

export default SyncAllBankAccountsButton;
