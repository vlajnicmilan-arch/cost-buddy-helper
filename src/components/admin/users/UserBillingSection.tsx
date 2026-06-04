import { useTranslation } from 'react-i18next';
import { CreditCard, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBillingPlanLabel } from '@/lib/adminAccess';

interface Props {
  userId: string;
  currentTier: string;
  loading: boolean;
  onChangeTier: (tier: string) => void;
}

export const UserBillingSection = ({
  userId,
  currentTier,
  loading,
  onChangeTier,
}: Props) => {
  const { t } = useTranslation();
  const currentLabelKey = formatBillingPlanLabel(currentTier);

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {t('admin.user.billingSection.title', 'Naplata')}
          </p>
        </div>
        <span className="text-[10px] px-1.5 py-0 rounded bg-muted text-muted-foreground">
          {t('admin.user.billingSection.layerChip', 'Sloj 1')}
        </span>
      </div>

      <div className="text-xs">
        <span className="text-muted-foreground">
          {t('admin.user.billingSection.current', 'Trenutno')}:
        </span>{' '}
        <span className="font-medium">{t(currentLabelKey)}</span>
      </div>

      <Select
        value={currentTier}
        onValueChange={onChangeTier}
        disabled={loading}
      >
        <SelectTrigger className="w-full h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[70]">
          <SelectItem value="free">{t('admin.billing.planLabel.coreOnly')}</SelectItem>
          <SelectItem value="pro">{t('admin.billing.planLabel.projects')}</SelectItem>
          <SelectItem value="business">{t('admin.billing.planLabel.business')}</SelectItem>
        </SelectContent>
      </Select>

      {loading && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('admin.user.billingSection.saving', 'Spremam...')}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        {t(
          'admin.user.billingSection.note',
          'Mijenja samo billing zapis. Admin override modula uređuje se ispod.'
        )}
      </p>
    </div>
  );
};
