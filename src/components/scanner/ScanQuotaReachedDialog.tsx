import { useTranslation } from 'react-i18next';
import { Crown, Camera } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ScanQuotaReachedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetAt: string | null;
  onUpgradeClick?: () => void;
}

function formatResetAt(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Dialog koji se prikazuje kad free user iscrpi Core scan kvotu (3 / 30 dana).
 * Server-side gate je u edge functions (consume_core_scan_quota); ovo je UI.
 */
export function ScanQuotaReachedDialog({
  open,
  onOpenChange,
  resetAt,
  onUpgradeClick,
}: ScanQuotaReachedDialogProps) {
  const { t, i18n } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Camera className="h-6 w-6" aria-hidden />
          </div>
          <DialogTitle className="text-center">
            {t('scanner.coreQuota.title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('scanner.coreQuota.body', { resetAt: formatResetAt(resetAt, i18n.language) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {onUpgradeClick && (
            <Button onClick={onUpgradeClick} className="w-full gap-2">
              <Crown className="h-4 w-4" />
              {t('scanner.coreQuota.cta')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            {t('scanner.coreQuota.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
