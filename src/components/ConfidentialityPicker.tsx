// Compact radio group for choosing the confidentiality marker applied to an
// exported report. Persists the last selection per-user via localStorage.
import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTranslation } from 'react-i18next';
import {
  loadLastConfidentiality,
  saveLastConfidentiality,
  type ConfidentialityLevel,
} from '@/lib/reportDesign';

interface Props {
  value: ConfidentialityLevel;
  onChange: (level: ConfidentialityLevel) => void;
  className?: string;
}

export const ConfidentialityPicker = ({ value, onChange, className }: Props) => {
  const { t } = useTranslation();

  const setAndPersist = (level: ConfidentialityLevel) => {
    saveLastConfidentiality(level);
    onChange(level);
  };

  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
        {t('reportBranding.confidentialityTitle')}
      </Label>
      <RadioGroup value={value} onValueChange={(v) => setAndPersist(v as ConfidentialityLevel)} className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="none" id="vmb-conf-none" />
          <Label htmlFor="vmb-conf-none" className="text-sm font-normal cursor-pointer">{t('reportBranding.confidentiality.none')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="internal" id="vmb-conf-internal" />
          <Label htmlFor="vmb-conf-internal" className="text-sm font-normal cursor-pointer">{t('reportBranding.confidentiality.internal')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="confidential" id="vmb-conf-confidential" />
          <Label htmlFor="vmb-conf-confidential" className="text-sm font-normal cursor-pointer">{t('reportBranding.confidentiality.confidential')}</Label>
        </div>
      </RadioGroup>
    </div>
  );
};

/** Convenience hook to manage selected level with localStorage persistence. */
export const useConfidentialityLevel = (): [ConfidentialityLevel, (l: ConfidentialityLevel) => void] => {
  const [level, setLevel] = useState<ConfidentialityLevel>('none');
  useEffect(() => { setLevel(loadLastConfidentiality()); }, []);
  const update = (l: ConfidentialityLevel) => { saveLastConfidentiality(l); setLevel(l); };
  return [level, update];
};
