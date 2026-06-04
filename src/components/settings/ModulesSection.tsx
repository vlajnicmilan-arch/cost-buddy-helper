import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  Building2,
  FolderKanban,
  Lock,
  Sparkles,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '@/contexts/AppStateContext';
import { useModuleStates } from '@/hooks/useModuleStates';
import { useMyActiveModuleGrants, GrantModule } from '@/hooks/useMyActiveModuleGrants';
import {
  getSettingsCardState,
  type AppModule,
  type SettingsCardState,
} from '@/lib/moduleVisibility';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';


interface ModulesSectionProps {
  /** Otvara BusinessProfileDialog (Tvrtke) iz parenta. */
  onShowBusinessProfile: () => void;
  /** Lokalni način nema cloud-vezane module — kompletno se sakriva. */
  isLocalMode: boolean;
}

interface ModuleCardConfig {
  module: AppModule;
  icon: typeof Users;
  title: string;
  description: string;
  lockedDescription?: string;
}

/**
 * Settings → Moduli
 *
 * Jedini UI ulaz za uključivanje/isključivanje opcionalnih modula
 * (Family, Projekti, Business). Core nije prikazan jer je uvijek aktivan.
 *
 * Faza 1: nema billing logike osim navigacije na /paywall za zaključane
 * Business toggle pokušaje. Card state dolazi iz `getSettingsCardState`.
 */
export const ModulesSection = ({
  onShowBusinessProfile,
  isLocalMode,
}: ModulesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    familyModeEnabled,
    setFamilyModeEnabled,
    projectsModuleEnabled,
    setProjectsModuleEnabled,
    businessFeatureEnabled,
    setBusinessFeatureEnabled,
  } = useAppState();
  const moduleStates = useModuleStates();
  const { getGrant } = useMyActiveModuleGrants();
  const [showFamilyDisableConfirm, setShowFamilyDisableConfirm] = useState(false);

  if (isLocalMode) return null;


  const cards: ModuleCardConfig[] = [
    {
      module: 'family',
      icon: Users,
      title: t('settings.modules.family.title', 'Obitelj'),
      description: t(
        'settings.modules.family.description',
        'Obiteljske grupe, dijeljeni računi i budžeti'
      ),
      lockedDescription: t(
        'settings.modules.family.locked',
        'Dostupno uz Pro pretplatu'
      ),
    },
    {
      module: 'projects',
      icon: FolderKanban,
      title: t('settings.modules.projects.title', 'Projekti'),
      description: t(
        'settings.modules.projects.description',
        'Praćenje budžeta i troškova po projektu'
      ),
      lockedDescription: t(
        'settings.modules.projects.locked',
        'Dostupno uz Pro pretplatu'
      ),
    },
    {
      module: 'business',
      icon: Building2,
      title: t('settings.modules.business.title', 'Business'),
      description: t(
        'settings.modules.business.description',
        'Poslovna terminologija i profili tvrtki'
      ),
      lockedDescription: t(
        'settings.modules.business.locked',
        'Dostupno uz Business pretplatu'
      ),
    },
  ];

  const onToggle = (module: AppModule, nextEnabled: boolean) => {
    const state = moduleStates[module];
    if (!state.tierUnlocked) {
      showError(t('settings.modules.lockedToast', 'Dostupno uz nadogradnju'));
      navigate('/paywall');
      return;
    }

    if (module === 'family') {
      if (!nextEnabled) {
        setShowFamilyDisableConfirm(true);
        return;
      }
      setFamilyModeEnabled(true);
      showSuccess(t('settings.familyModeEnabled', 'Obiteljski način uključen'));
      return;
    }

    if (module === 'projects') {
      setProjectsModuleEnabled(nextEnabled);
      showSuccess(
        nextEnabled
          ? t('settings.modules.projects.enabled', 'Projekti uključeni')
          : t('settings.modules.projects.disabled', 'Projekti isključeni')
      );
      return;
    }

    if (module === 'business') {
      setBusinessFeatureEnabled(nextEnabled);
      showSuccess(
        nextEnabled
          ? t('settings.businessModeEnabled', 'Poslovni način uključen')
          : t('settings.businessModeDisabled', 'Osobni način vraćen')
      );
    }
  };

  const renderCard = (cfg: ModuleCardConfig) => {
    const state = moduleStates[cfg.module];
    const cardState: SettingsCardState = getSettingsCardState(cfg.module, state);
    const Icon = cfg.icon;
    const isLocked = cardState === 'locked';
    const isActive = cardState === 'active';

    // Read-only badge: prikazuje se SAMO kad modul ima aktivan admin override grant.
    // Strogo informativan: bez CTA, bez interakcije, ne mijenja access logiku.
    const overrideModule: GrantModule | null =
      cfg.module === 'projects' ? 'projects' : cfg.module === 'business' ? 'business' : null;
    const overrideGrant = overrideModule ? getGrant(overrideModule) : undefined;
    const showOverrideBadge = !!overrideGrant && !state.tierUnlocked;

    return (
      <div
        key={cfg.module}
        className="flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-xl"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Label
                htmlFor={`module-${cfg.module}`}
                className="text-sm font-medium cursor-pointer"
              >
                {cfg.title}
              </Label>
              {isLocked && !showOverrideBadge && <Lock className="w-3 h-3 text-muted-foreground" />}
              {isActive && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
                  <Check className="w-3 h-3" />
                  {t('settings.modules.active', 'Aktivno')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLocked && !showOverrideBadge && cfg.lockedDescription
                ? cfg.lockedDescription
                : cfg.description}
            </p>

            {showOverrideBadge && overrideGrant && (
              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px]">
                <ShieldCheck className="w-3 h-3" />
                <span>
                  {t('settings.modules.overrideBadge.source', 'Admin override')} •{' '}
                  {overrideGrant.expires_at
                    ? format(new Date(overrideGrant.expires_at), 'dd.MM.yyyy.', { locale: hr })
                    : t('settings.modules.overrideBadge.permanent', 'Trajno')}
                </span>
              </div>
            )}


            {cfg.module === 'business' && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={onShowBusinessProfile}
              >
                <Building2 className="w-4 h-4 mr-2" />
                {t('business.companies', 'Tvrtke')}
              </Button>
            )}

            {isLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-xs text-primary"
                onClick={() => navigate('/paywall')}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {t('settings.modules.upgradeCta', 'Nadogradi')}
              </Button>
            )}
          </div>
        </div>
        <Switch
          id={`module-${cfg.module}`}
          checked={
            cfg.module === 'family'
              ? familyModeEnabled
              : cfg.module === 'projects'
                ? projectsModuleEnabled
                : businessFeatureEnabled && state.tierUnlocked
          }
          onCheckedChange={(checked) => onToggle(cfg.module, checked)}
        />
      </div>
    );
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('settings.modules.title', 'Moduli')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.modules.subtitle',
              'Uključi samo ono što ti treba — sučelje ostaje čisto.'
            )}
          </p>
        </div>

        <div className="space-y-2">{cards.map(renderCard)}</div>
      </div>

      <AlertDialog
        open={showFamilyDisableConfirm}
        onOpenChange={setShowFamilyDisableConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <Users className="w-5 h-5" />
              {t('settings.familyDisableTitle', 'Isključiti obiteljski način?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('settings.familyDisableDesc', 'Isključivanjem obiteljskog načina:')}</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>
                  {t(
                    'settings.familyDisableWarn1',
                    'Nećete više vidjeti obiteljske grupe u navigaciji'
                  )}
                </li>
                <li>
                  {t(
                    'settings.familyDisableWarn2',
                    'Dijeljeni računi, budžeti i ciljevi štednje neće biti vidljivi'
                  )}
                </li>
              </ul>
              <p className="font-medium text-foreground mt-3">
                {t(
                  'settings.familyDisableKeep',
                  'Vaši podaci ostaju sačuvani i bit će dostupni ako ponovno uključite obiteljski način.'
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setFamilyModeEnabled(false);
                setShowFamilyDisableConfirm(false);
                showSuccess(
                  t('settings.familyModeDisabled', 'Obiteljski način isključen')
                );
              }}
            >
              {t('settings.familyDisableConfirm', 'Isključi')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
