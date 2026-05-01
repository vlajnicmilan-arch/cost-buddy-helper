/**
 * UsageProfileSection — Settings panel allowing the user to change between
 * 'finance_only' and 'finance_projects' after onboarding.
 *
 * Behaviour:
 * - Switching to 'finance_only' shows a confirm dialog (Projects tab/strip
 *   becomes hidden but data is preserved).
 * - Switching to 'finance_projects' opens a plan-comparison dialog (same
 *   component as in onboarding). The user can:
 *     - keep Free and just enable the module, OR
 *     - tap "Activate plan" → navigates to /paywall.
 *   This keeps Settings consistent with the onboarding flow.
 * - Legacy users (usageProfile === null) are treated as 'finance_projects'.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wallet, FolderKanban, Check } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OnboardingUsageProfileStep } from '@/components/onboarding/OnboardingUsageProfileStep';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { cn } from '@/lib/utils';
import type { UsageProfile } from '@/contexts/AppStateContext';

export const UsageProfileSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { usageProfile, setUsageProfile } = useAppState();

  const [pendingHide, setPendingHide] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [draftProfile, setDraftProfile] =
    useState<Exclude<UsageProfile, null>>('finance_projects');
  const [draftPlan, setDraftPlan] = useState<'free' | 'pro' | 'business'>('free');

  // Treat legacy (null) as finance_projects for display purposes.
  const effective: 'finance_only' | 'finance_projects' =
    usageProfile === 'finance_only' ? 'finance_only' : 'finance_projects';

  const handlePick = (next: 'finance_only' | 'finance_projects') => {
    if (next === effective) return;
    if (next === 'finance_only') {
      setPendingHide(true);
      return;
    }
    // Enabling project module → show plan comparison dialog (same UX as onboarding).
    setDraftProfile('finance_projects');
    setDraftPlan('free');
    setPlanDialogOpen(true);
  };

  const confirmHideProjects = () => {
    setUsageProfile('finance_only');
    setPendingHide(false);
    showSuccess(t('settings.usageProfile.disabled', 'Projektni modul sakriven'));
  };

  const confirmEnableWithFree = () => {
    setUsageProfile('finance_projects');
    setPlanDialogOpen(false);
    showSuccess(t('settings.usageProfile.enabled', 'Projektni modul uključen'));
  };

  const handleOpenPaywall = () => {
    // Persist the profile change first so the user lands back into the right UI.
    setUsageProfile('finance_projects');
    setPlanDialogOpen(false);
    navigate('/paywall');
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

      {/* Confirm hiding the Projects module */}
      <AlertDialog open={pendingHide} onOpenChange={(o) => !o && setPendingHide(false)}>
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

      {/* Plan comparison dialog — when enabling the project module */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('settings.usageProfile.enableTitle', 'Uključi projektni modul')}
            </DialogTitle>
          </DialogHeader>

          <OnboardingUsageProfileStep
            selected={draftProfile}
            onSelect={setDraftProfile}
            selectedPlan={draftPlan}
            onSelectPlan={setDraftPlan}
            onOpenPaywall={handleOpenPaywall}
          />

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={confirmEnableWithFree}>
              {draftPlan === 'free'
                ? t('settings.usageProfile.continueFree', 'Nastavi s besplatnim')
                : t('settings.usageProfile.enableModule', 'Uključi modul')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
