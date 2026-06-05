import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';

interface ManualAddTriggerButtonProps {
  businessProfileId?: string | null;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
}

/**
 * Thin trigger that opens the global AddExpenseDialog hosted in App.tsx
 * in MANUAL mode (no autoScan). Replaces page-level `<AddExpenseDialog>`
 * triggers so the "Photograph" action inside survives Android Activity
 * recreation during the camera step.
 */
export const ManualAddTriggerButton = ({
  businessProfileId = null,
  triggerClassName,
  triggerLabel,
  triggerIcon,
}: ManualAddTriggerButtonProps) => {
  const { t } = useTranslation();
  const { openManualAdd } = useReceiptScan();

  return (
    <Button
      type="button"
      data-testid="add-expense-fab"
      onClick={() => openManualAdd({ businessProfileId })}
      className={cn(
        'gap-2 rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20',
        triggerClassName,
      )}
    >
      {triggerIcon ?? <Plus className="w-5 h-5" />}
      {triggerLabel ?? t('common.add')}
    </Button>
  );
};
