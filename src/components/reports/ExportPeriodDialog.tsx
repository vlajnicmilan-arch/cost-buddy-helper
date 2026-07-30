import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESET_OPTIONS,
  resolvePeriodRange,
  type PeriodPreset,
  type PeriodRange,
} from '@/lib/periodPresets';

interface ExportPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dataset used by the "all time" preset to resolve the earliest date. */
  dates: Date[];
  onConfirm: (range: PeriodRange, preset: PeriodPreset) => void;
}

/**
 * Small period picker shown before an export runs. Presets mirror the
 * ReportsDialog logic 1:1 through the shared `periodPresets` helper.
 * Default preset: this month.
 */
export const ExportPeriodDialog = ({
  open,
  onOpenChange,
  dates,
  onConfirm,
}: ExportPeriodDialogProps) => {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<PeriodPreset>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const range = useMemo(
    () => resolvePeriodRange(preset, { customStart, customEnd, dates }),
    [preset, customStart, customEnd, dates],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm z-[70]">
        <DialogHeader>
          <DialogTitle>{t('reports.exportPeriodTitle', 'Razdoblje izvoza')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label className="text-sm">{t('reports.selectPeriod', 'Odaberi razdoblje')}</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[80]">
              {PERIOD_PRESET_OPTIONS.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(PERIOD_PRESET_LABELS[key].key, PERIOD_PRESET_LABELS[key].fallback)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === 'custom' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">{t('reports.from', 'Od')}</Label>
                <Input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">{t('reports.to', 'Do')}</Label>
                <Input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm(range, preset);
            }}
          >
            {t('common.export', 'Izvoz')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
