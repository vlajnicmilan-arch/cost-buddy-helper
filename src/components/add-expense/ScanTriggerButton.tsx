import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useReceiptScan } from '@/contexts/ReceiptScanContext';

interface ScanTriggerButtonProps {
  businessProfileId?: string | null;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
}

/**
 * Thin trigger that opens the global scan dialog hosted in App.tsx.
 * Replaces `<AddExpenseDialog autoScan ...>` at the page level so the
 * scan flow survives Android Activity recreation during the camera step.
 */
export const ScanTriggerButton = ({
  businessProfileId = null,
  triggerClassName,
  triggerLabel,
  triggerIcon,
}: ScanTriggerButtonProps) => {
  const { t } = useTranslation();
  const { openScan } = useReceiptScan();

  return (
    <Button
      type="button"
      onClick={() => openScan({ businessProfileId })}
      className={cn(
        'gap-2 rounded-xl shadow-lg bg-ai hover:bg-ai/90 text-ai-foreground shadow-ai/20',
        triggerClassName,
      )}
    >
      {triggerIcon ?? <ScanLine className="w-5 h-5" />}
      {triggerLabel ?? t('common.scan', 'Skeniraj')}
    </Button>
  );
};
