import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Wallet as WalletIcon, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useHiddenPaymentSources } from '@/hooks/useHiddenPaymentSources';
import { useWalletViewMode } from '@/contexts/WalletViewModeContext';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';

/**
 * Wallet PR1 — hero summary card.
 *
 * - Total = sum of OWNED sources (isOwned !== false) in the current view context
 *   (Personal or active business profile). Reuses `useCustomPaymentSources` which
 *   already scopes by `activeBusinessProfileId`.
 * - Hidden sources are excluded from total by default; toggle re-includes them.
 * - Shared-with-you (isOwned === false) balance is shown as a secondary line if > 0.
 * - FX conversion mirrors `PaymentSourcesSection` (dashboard).
 */
export const WalletHeroCard = () => {
  const { t } = useTranslation();
  const { formatAmount, currency, multiCurrencyEnabled } = useCurrency();
  const { convert } = useExchangeRates(multiCurrencyEnabled);
  const { customPaymentSources } = useCustomPaymentSources();
  const { hiddenIds } = useHiddenPaymentSources();
  const { isBusinessView, businessProfileId } = useWalletViewMode();
  const { profiles } = useBusinessProfiles();

  const [includeHidden, setIncludeHidden] = useState(false);

  const contextLabel = useMemo(() => {
    if (isBusinessView && businessProfileId) {
      const p = profiles.find(x => x.id === businessProfileId);
      return p?.name || t('wallet.personal', 'Osobno');
    }
    return t('wallet.personal', 'Osobno');
  }, [isBusinessView, businessProfileId, profiles, t]);

  const toRef = (bal: number, curr?: string | null) => {
    if (multiCurrencyEnabled && curr && curr !== currency.code) {
      return convert(bal, curr, currency.code);
    }
    return bal;
  };

  const { total, sharedTotal, hiddenCount } = useMemo(() => {
    let total = 0;
    let shared = 0;
    let hidden = 0;
    for (const s of customPaymentSources) {
      const bal = toRef(s.balance || 0, s.currency);
      const isShared = s.isOwned === false;
      const isHidden = hiddenIds.has(s.id);
      if (isShared) {
        if (bal > 0) shared += bal;
        continue;
      }
      if (isHidden) {
        hidden += 1;
        if (!includeHidden) continue;
      }
      total += bal;
    }
    return { total, sharedTotal: shared, hiddenCount: hidden };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPaymentSources, hiddenIds, includeHidden, multiCurrencyEnabled, currency.code]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border bg-card p-4 sm:p-5"
      style={{ borderLeftWidth: 4, borderLeftColor: 'hsl(var(--primary))' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <WalletIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('wallet.totalBalance', 'Ukupno')} · {contextLabel}
            </p>
            <p
              data-testid="wallet-hero-balance"
              className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${total >= 0 ? 'text-primary' : 'text-destructive'}`}
            >
              {formatAmount(total)}
            </p>
            {sharedTotal > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('wallet.sharedAccounts', {
                  amount: formatAmount(sharedTotal),
                  defaultValue: '+ {{amount}} na dijeljenim računima',
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {hiddenCount > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
          <Label
            htmlFor="wallet-include-hidden"
            className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5" />
            {t('wallet.includeHidden', 'Uključi sakrivene')}
            <span className="text-[10px] opacity-70">({hiddenCount})</span>
          </Label>
          <Switch
            id="wallet-include-hidden"
            checked={includeHidden}
            onCheckedChange={setIncludeHidden}
          />
        </div>
      )}
    </motion.div>
  );
};
