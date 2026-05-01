/**
 * UsageProfileSection — Settings panel allowing the user to change between
 * 'finance_only' and 'finance_projects' after onboarding.
 *
 * - Switching to 'finance_only' hides the Projects tab from BottomNav and
 *   the ActiveProjectsStrip from the home view. Projects themselves are NOT
 *   deleted — only hidden from navigation.
 * - Legacy users (usageProfile === null) see the section pre-selected as
 *   'finance_projects' (since that mirrors the legacy "show everything"
 *   behaviour) and can opt out at any time.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, FolderKanban, Check } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { cn } from '@/lib/utils';

export const UsageProfileSection = () => {
  const { t } = useTranslation();
  const { usageProfile, setUsageProfile } = useAppState();
  const [pendingChange, setPendingChange] = useState<'finance_only' | null>(null);

  // Treat legacy (null) as finance_projects for display purposes.
  const effective: 'finance_only' | 'finance_projects' =
    usageProfile === 'finance_only' ? 'finance_only' : 'finance_projects';

  const handlePick = (next: 'finance_only' | 'finance_projects') => {
    if (next === effective) return;
    if (next === 'finance_only') {
      // Confirm — hides Projects tab from navigation.
      setPendingChange('finance_only');
      return;
    }
    setUsageProfile('finance_projects');
    showSuccess(t('settings.usageProfile.enabled', 'Projektni modul uključen'));
  };

  const confirmHideProjects = () => {
    setUsageProfile('finance_only');
    setPendingChange(null);
    showSuccess(t('settings.usageProfile.disabled', 'Projektni modul sakriven'));
  };

  const options: Array<{
    id: 'finance_only' | 'finance_projects';
    icon: typeof Wallet;
    title: string;
    desc: string;
  }> = [
    {
      id: 'finance_only',
      icon: Wallet,
      title: t('settings.usageProfile.financeOnly', 'Samo financije'),
      desc: t('settings.usageProfile.financeOnlyDesc', 'Sakriva tab Projekti iz navigacije.'),
    },
    {
      id: 'finance_projects',
      icon: FolderKanban,
      title: t('settings.usageProfile.financeProjects', 'Financije + projekti'),
      desc: t('settings.usageProfile.financeProjectsDesc', 'Pune značajke aplikacije.'),
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">
          {t('settings.usageProfile.title', 'Profil korištenja')}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            'settings.usageProfile.subtitle',
            'Što želiš pratiti u aplikaciji. Možeš mijenjati u bilo kojem trenutku.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((o) => {
          const isSel = effective === o.id;
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => handlePick(o.id)}
              className={cn(
                'min-h-[88px] p-3 rounded-xl border-2 text-left transition-all flex gap-3 items-start',
                isSel
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              )}
              aria-pressed={isSel}
            >
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                isSel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm">{o.title}</p>
                  {isSel && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{o.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <AlertDialog open={pendingChange === 'finance_only'} onOpenChange={(o) => !o && setPendingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.usageProfile.confirmTitle', 'Sakriti projektni modul?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'settings.usageProfile.confirmDesc',
                'Tab Projekti i sve preporuke vezane za projekte bit će skrivene iz navigacije. Tvoji postojeći projekti i podaci ostaju spremljeni i bit će dostupni ako ponovno uključiš ovu opciju.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHideProjects}>
              {t('settings.usageProfile.confirmHide', 'Sakrij projekte')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
