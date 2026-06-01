import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface PrivacyToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/**
 * Toggle to mark a transaction as private (excluded from family proportional split).
 * Used inside AddExpenseDialog / EditTransactionDialog when the chosen payment source
 * is a shared family account.
 */
export function PrivacyToggle({ value, onChange, disabled }: PrivacyToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2 min-w-0">
        <EyeOff className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <Label htmlFor="privacy-toggle" className="text-sm font-medium">
            {t('family.split.privacy.label')}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('family.split.privacy.hint')}
          </p>
        </div>
      </div>
      <Switch
        id="privacy-toggle"
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
