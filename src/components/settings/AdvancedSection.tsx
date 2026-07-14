import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown, Loader2, RefreshCw, Globe, Download, ImageOff, Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { RuntimeDiagnostics } from '@/components/update/RuntimeDiagnostics';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportMode } from '@/lib/fileExport';

interface AdvancedSectionProps {
  onCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  multiCurrencyEnabled: boolean;
  onMultiCurrencyChange: (v: boolean) => void;
  onExport: (mode?: ExportMode) => void;
  isExporting: boolean;
  isAdmin?: boolean;
}

export const AdvancedSection = ({
  onCheckForUpdates, isCheckingUpdate,
  multiCurrencyEnabled, onMultiCurrencyChange,
  onExport, isExporting,
  isAdmin,
}: AdvancedSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-4">
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <Wrench className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">
                {t('settings.advanced.title', 'Napredno')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('settings.advanced.desc', 'Tehničke opcije i alati')}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4">
        {/* Check for updates */}
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl"
          onClick={onCheckForUpdates}
          disabled={isCheckingUpdate}
        >
          {isCheckingUpdate ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('settings.checkForUpdates', 'Provjeri ažuriranja')}
        </Button>

        {/* Multi-currency */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <div>
              <Label className="text-sm font-medium">{t('settings.multiCurrency', 'Viševalutni računi')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.multiCurrencyDesc', 'Svaki izvor plaćanja može imati svoju valutu')}</p>
            </div>
          </div>
          <Switch
            checked={multiCurrencyEnabled}
            onCheckedChange={(checked) => {
              onMultiCurrencyChange(checked);
              showSuccess(checked
                ? t('settings.multiCurrencyEnabled', 'Viševalutni način omogućen')
                : t('settings.multiCurrencyDisabled', 'Viševalutni način onemogućen'));
            }}
          />
        </div>

        {/* Export JSON */}
        <ExportButton
          label={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.export', 'Izvezi podatke (JSON)')}
          icon={<Download className="w-4 h-4 mr-2" />}
          onExport={(mode) => onExport(mode)}
          variant="outline"
          size="default"
          disabled={isExporting}
          className="w-full gap-2 rounded-xl justify-start"
        />

        {/* Clear receipt cache */}
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

        {/* Runtime diagnostics — admin only */}
        {isAdmin && <RuntimeDiagnostics />}
      </CollapsibleContent>
    </Collapsible>
  );
};
