import { useMemo } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStorage } from '@/contexts/StorageContext';
import { useNavigate } from 'react-router-dom';
import { Clock, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

/**
 * TrialBanner — per-modul (politika B).
 *
 * Prikazuje se samo cloud korisnicima koji NISU pretplaćeni i imaju barem
 * jedan aktivan modul-trial (source === 'trial') s poznatim period_end.
 * Nema više globalnog "sve značajke su otključane" — trial je uvijek
 * per-modul i korisnik ga svjesno pokreće.
 */
export const TrialBanner = () => {
  const { t } = useTranslation();
  const { entitlements, subscribed } = useSubscription();
  const { storageMode } = useStorage();
  const navigate = useNavigate();

  const activeTrial = useMemo(() => {
    if (storageMode !== 'cloud' || subscribed) return null;
    const MODULE_LABELS: Record<string, string> = {
      smjer: t('moduleUpgrade.smjer.title', 'Smjer'),
      krug: t('moduleUpgrade.krug.title', 'Krug'),
      projekti: t('moduleUpgrade.projekti.title', 'Projekti'),
      biznis: t('moduleUpgrade.biznis.title', 'Biznis'),
    };
    const now = Date.now();
    const modules: Array<{ key: string; label: string; daysLeft: number }> = [];
    for (const [key, ent] of Object.entries(entitlements)) {
      if (!ent?.active) continue;
      if (ent.source !== 'trial') continue;
      if (!ent.period_end) continue;
      const end = new Date(ent.period_end).getTime();
      if (!Number.isFinite(end) || end <= now) continue;
      const days = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
      modules.push({ key, label: MODULE_LABELS[key] ?? key, daysLeft: days });
    }
    if (modules.length === 0) return null;
    // Pokazuj najkritičniji trial (najmanje dana preostalo).
    modules.sort((a, b) => a.daysLeft - b.daysLeft);
    return modules[0];
  }, [entitlements, subscribed, storageMode, t]);

  if (!activeTrial) return null;

  const urgency = activeTrial.daysLeft <= 2;

  const message =
    activeTrial.daysLeft === 0
      ? t('trial.moduleActiveLastDay', 'Zadnji dan probnog razdoblja za {{module}}', { module: activeTrial.label })
      : activeTrial.daysLeft === 1
        ? t('trial.moduleActiveOneDay', 'Probno razdoblje za {{module}} istječe sutra', { module: activeTrial.label })
        : t('trial.moduleActiveDaysLeft', 'Probno razdoblje za {{module}} istječe za {{count}} dana', {
            module: activeTrial.label,
            count: activeTrial.daysLeft,
          });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`mb-4 p-3 rounded-xl flex items-center justify-between gap-3 ${
        urgency
          ? 'bg-destructive/10 border border-destructive/20'
          : 'bg-primary/5 border border-primary/10'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          urgency ? 'bg-destructive/15' : 'bg-primary/10'
        }`}>
          <Clock className={`w-4 h-4 ${urgency ? 'text-destructive' : 'text-primary'}`} />
        </div>
        <p className="text-sm font-medium text-foreground leading-tight min-w-0 truncate">
          {message}
        </p>
      </div>
      <Button
        size="sm"
        variant={urgency ? 'destructive' : 'default'}
        className="shrink-0 rounded-lg gap-1.5 text-xs"
        onClick={() => navigate('/paywall')}
      >
        <Zap className="w-3.5 h-3.5" />
        {t('trial.upgrade', 'Nadogradi')}
      </Button>
    </motion.div>
  );
};
