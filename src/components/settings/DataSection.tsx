import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coins, Globe, Download, Upload, Loader2, Zap, RefreshCw, Database, ChevronRight, Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { CURRENCIES, CurrencyCode } from '@/contexts/CurrencyContext';
import { Separator } from '@/components/ui/separator';
import { RuntimeDiagnostics } from '@/components/update/RuntimeDiagnostics';
import { ExportButton } from '@/components/ui/export-button';
import type { ExportMode } from '@/lib/fileExport';

interface DataSectionProps {
  // Storage
  isLocalMode: boolean;
  onNavigateToSetup: () => void;
  // Updates
  autoUpdate: boolean;
  onAutoUpdateChange: (v: boolean) => void;
  onCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  // Currency
  currencyCode: CurrencyCode;
  onCurrencyChange: (code: CurrencyCode) => void;
  multiCurrencyEnabled: boolean;
  onMultiCurrencyChange: (v: boolean) => void;
  // Export/Import
  onExport: (mode?: ExportMode) => void;
  isExporting: boolean;
  onShowImportDialog: () => void;
}

export const DataSection = ({
  isLocalMode, onNavigateToSetup,
  autoUpdate, onAutoUpdateChange, onCheckForUpdates, isCheckingUpdate,
  currencyCode, onCurrencyChange,
  multiCurrencyEnabled, onMultiCurrencyChange,
  onExport, isExporting, onShowImportDialog
}: DataSectionProps) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Storage */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('settings.storage', 'Pohrana')}
        </h3>
        <button
          onClick={onNavigateToSetup}
          className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium">{t('settings.storageMode', 'Način pohrane')}</p>
              <p className="text-xs text-muted-foreground">
                {isLocalMode ? t('settings.localMode', 'Lokalna pohrana') : t('settings.cloudMode', 'Cloud pohrana')}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <Separator />

      {/* Updates */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('settings.updates', 'Ažuriranja')}
        </h3>
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <Label htmlFor="auto-update-settings" className="text-sm font-medium cursor-pointer">
                {t('settings.autoUpdate', 'Automatsko ažuriranje')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.autoUpdateDesc', 'Automatski primijeni nova ažuriranja')}
              </p>
            </div>
          </div>
          <Switch id="auto-update-settings" checked={autoUpdate} onCheckedChange={onAutoUpdateChange} />
        </div>
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl"
          onClick={onCheckForUpdates}
          disabled={isCheckingUpdate}
        >
          {isCheckingUpdate ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('settings.checkForUpdates', 'Provjeri ažuriranja')}
        </Button>
        <RuntimeDiagnostics />
      </div>

      <Separator />

      {/* Currency / Display */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('settings.display', 'Prikaz')}
        </h3>
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Coins className="w-4 h-4 text-primary" />
            </div>
            <div>
              <Label className="text-sm font-medium">{t('settings.currency', 'Valuta')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.currencyDesc', 'Odaberi valutu za prikaz')}</p>
            </div>
          </div>
          <Select
            value={currencyCode}
            onValueChange={(value) => {
              onCurrencyChange(value as CurrencyCode);
              showSuccess(t('settings.currencyChanged', 'Valuta promijenjena'));
            }}
          >
            <SelectTrigger className="w-[100px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((curr) => (
                <SelectItem key={curr.code} value={curr.code}>
                  <span className="flex items-center gap-2">
                    <span>{curr.symbol}</span>
                    <span>{curr.code}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
      </div>

      <Separator />

      {/* Data Export/Import */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('settings.data', 'Podaci')}
        </h3>
        <ExportButton
          label={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.export', 'Izvezi podatke (JSON)')}
          icon={<Download className="w-4 h-4 mr-2" />}
          onExport={(mode) => onExport(mode)}
          variant="outline"
          size="default"
          disabled={isExporting}
          className="w-full gap-2 rounded-xl justify-start"
        />
        <Button variant="outline" className="w-full gap-2 rounded-xl justify-start" onClick={onShowImportDialog}>
          <Upload className="w-4 h-4" />
          {t('settings.import', 'Uvezi backup')}
        </Button>
      </div>
    </>
  );
};
