import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Trash2, RotateCcw, ImageOff, Shield, Share2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { APP_VERSION } from '@/lib/version';

interface DangerZoneSectionProps {
  onShowResetConfirm: () => void;
  onShowDeleteConfirm: () => void;
  user: { id: string } | null;
  onNavigateToPrivacy: () => void;
  onNavigateToTrash?: () => void;
  onShareApp: () => void;
}

export const DangerZoneSection = ({
  onShowResetConfirm, onShowDeleteConfirm,
  user, onNavigateToPrivacy, onNavigateToTrash, onShareApp
}: DangerZoneSectionProps) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Danger Zone */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide">
          {t('settings.dangerZone', 'Opasna zona')}
        </h3>

        {/* Trash (Koš za smeće) */}
        {onNavigateToTrash && (
          <button
            onClick={onNavigateToTrash}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium cursor-pointer">
                {t('trash.title', 'Koš za smeće')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('trash.settingsDesc', 'Vraćanje obrisanih transakcija, projekata, faktura i ponuda.')}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* Clear receipt image cache */}
        <div className="p-3 border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <ImageOff className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium">
                {t('settings.clearReceiptCache', 'Očisti slike računa')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.clearReceiptCacheDesc', 'Briše lokalno spremljene slike računa s uređaja. Transakcije ostaju netaknute.')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2 rounded-xl"
            onClick={async () => {
              try {
                const { LocalFileCache } = await import('@/hooks/useLocalFileCache');
                const count = await LocalFileCache.clearAllCachedReceipts();
                showSuccess(t('settings.receiptCacheCleared_count', 'Obrisano {{count}} slika računa', { count }));
              } catch (e) {
                showError(t('settings.receiptCacheClearError', 'Greška pri brisanju slika'));
              }
            }}
          >
            <ImageOff className="w-4 h-4" />
            {t('settings.clearReceiptCacheBtn', 'Obriši sve slike')}
          </Button>
        </div>

        {/* Reset data */}
        <div className="p-3 border border-amber-500/30 bg-amber-500/5 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium text-amber-600">
                {t('settings.resetData', 'Kreni ispočetka')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.resetDataDesc', 'Briše sve transakcije, projekte i budžete. Novčanici ostaju sa svojim stanjima.')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2 rounded-xl border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
            onClick={onShowResetConfirm}
          >
            <RotateCcw className="w-4 h-4" />
            {t('settings.resetDataBtn', 'Resetiraj podatke')}
          </Button>
        </div>
        
        {/* Delete account */}
        <div className="p-3 border border-destructive/30 bg-destructive/5 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-destructive" />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium text-destructive">
                {t('settings.deleteAccount', 'Obriši račun')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.deleteAccountDesc', 'Trajno briše sve vaše podatke. Ova radnja se ne može poništiti.')}
              </p>
            </div>
          </div>
          <Button variant="destructive" className="w-full gap-2 rounded-xl" onClick={onShowDeleteConfirm}>
            <Trash2 className="w-4 h-4" />
            {t('settings.deleteAccountBtn', 'Obriši moj račun')}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Privacy & Legal */}
      <div className="space-y-2">
        <button
          onClick={onNavigateToPrivacy}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{t('gdpr.settingsPrivacyTitle', 'Politika privatnosti')}</p>
            <p className="text-xs text-muted-foreground">{t('gdpr.settingsPrivacyDesc', 'GDPR prava i obrada podataka')}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <Separator />

      {/* Share App */}
      {user && (
        <div className="space-y-2">
          <button
            onClick={onShareApp}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{t('settings.shareApp', 'Podijeli aplikaciju')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.shareAppDesc', 'Pozovi prijatelje na V&M Balance')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      <Separator />

      {/* App Info */}
      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>V&M Balance</p>
        <p>{t('settings.version', 'Verzija')} {APP_VERSION}</p>
      </div>
    </>
  );
};
