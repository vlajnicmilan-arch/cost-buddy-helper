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
  Bot,
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
import { showSuccess } from '@/hooks/useStatusFeedback';
import { ModuleUpgradeDialog, type UpgradeModule } from '@/components/modules/ModuleUpgradeDialog';


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
    krugModeEnabled,
    setKrugModeEnabled,
    projectsModuleEnabled,
    setProjectsModuleEnabled,
    businessFeatureEnabled,
    setBusinessFeatureEnabled,
    aiAssistantEnabled,
    setAiAssistantEnabled,
  } = useAppState();
  const moduleStates = useModuleStates();
  const { getGrant } = useMyActiveModuleGrants();
  const [showKrugDisableConfirm, setShowKrugDisableConfirm] = useState(false);
  const [upgradeFor, setUpgradeFor] = useState<UpgradeModule | null>(null);

  if (isLocalMode) return null;


  const cards: ModuleCardConfig[] = [
    {
      module: 'krug',
      icon: Users,
      title: t('settings.modules.krug.title', 'Krug'),
      description: t(
        'settings.modules.krug.description',
        'Dijeljene grupe — zajednički računi, projekti i budžeti'
      ),
      lockedDescription: t(
        'settings.modules.krug.locked',
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

    if (module === 'krug') {
      if (!nextEnabled) {
        setShowKrugDisableConfirm(true);
        return;
      }
      setKrugModeEnabled(true);
      showSuccess(t('settings.krugModeEnabled', 'Krug uključen'));
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

    // Read-only badge: prikazuje se kad postoji aktivan admin override grant
    // za ovaj modul. Strogo informativan: bez CTA, bez interakcije.
    const overrideModule: GrantModule | null =
      cfg.module === 'projects' ? 'projects' : cfg.module === 'business' ? 'business' : null;
    const overrideGrant = overrideModule ? getGrant(overrideModule) : undefined;
    const showOverrideBadge = !!overrideGrant;


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
            cfg.module === 'krug'
              ? krugModeEnabled
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

        {/* AI Asistent — nije modul u pravom smislu (nema tier gate), ali logički
            pripada uz ostale toggle-e "što želim vidjeti u aplikaciji". Premješteno
            iz "Obavijesti" u Faza 2 revizije postavki. */}
        {!isLocalMode && (
          <div className="flex items-start justify-between gap-3 p-3 bg-muted/30 rounded-xl">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="module-ai" className="text-sm font-medium cursor-pointer">
                  {t('settings.aiAssistant', 'AI Asistent')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.aiAssistantDesc', 'Prikaži AI savjete i asistenta')}
                </p>
              </div>
            </div>
            <Switch
              id="module-ai"
              checked={aiAssistantEnabled}
              onCheckedChange={(checked) => {
                setAiAssistantEnabled(checked);
                showSuccess(
                  checked
                    ? t('settings.aiEnabled', 'AI asistent uključen')
                    : t('settings.aiDisabled', 'AI asistent isključen')
                );
              }}
            />
          </div>
        )}
      </div>

      <AlertDialog
        open={showKrugDisableConfirm}
        onOpenChange={setShowKrugDisableConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <Users className="w-5 h-5" />
              {t('settings.krugDisableTitle', 'Isključiti Krug?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{t('settings.krugDisableDesc', 'Isključivanjem Kruga:')}</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t('settings.krugDisableWarn1', 'Nećete više vidjeti Krug tab u navigaciji')}</li>
                <li>{t('settings.krugDisableWarn2', 'Dijeljene grupe (računi, projekti, budžeti) neće biti vidljive')}</li>
              </ul>
              <p className="font-medium text-foreground mt-3">
                {t('settings.krugDisableKeep', 'Vaši podaci ostaju sačuvani i bit će dostupni ako ponovno uključite Krug.')}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setKrugModeEnabled(false);
                setShowKrugDisableConfirm(false);
                showSuccess(t('settings.krugModeDisabled', 'Krug isključen'));
              }}
            >
              {t('settings.krugDisableConfirm', 'Isključi')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
