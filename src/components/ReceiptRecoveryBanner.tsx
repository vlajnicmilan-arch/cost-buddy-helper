/**
 * Privremeni recovery banner.
 *
 * Prikazuje se SAMO na uređaju koji ima `receipt_cache_*` u lokalnom storageu.
 * Klikom vodi na /recovery/receipt-items gdje korisnik može vratiti artikle.
 * Banner sam nestane čim cache bude prazan (recovery flow briše ključeve).
 *
 * Bit će uklonjen u Fazi 3 zajedno s recovery rutom i helperom.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReceiptText, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listLocalCachedReceipts } from '@/lib/receiptRecovery';

export const ReceiptRecoveryBanner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await listLocalCachedReceipts();
        if (!cancelled) setCount(cached.length);
      } catch {
        // Sigurnosna mreža: korumpirani cache ne smije srušiti dashboard.
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/recovery/receipt-items')}
      className="w-full mb-4 min-h-11 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 active:bg-amber-500/20 transition-colors px-4 py-3 flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
      aria-label={t('recovery.banner.title', { count })}
    >
      <ReceiptText className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {t('recovery.banner.title', { count })}
        </p>
        <p className="text-xs text-muted-foreground">{t('recovery.banner.cta')}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
};
