/**
 * ConfirmActionDialog — aplikacijska zamjena za window.confirm / window.prompt.
 *
 * Prezentacijska komponenta: naslov, opis, opcionalno polje za razlog,
 * Odustani / Potvrdi. Semantika tokova ostaje kod pozivatelja — ovdje se
 * samo prikuplja potvrda (i razlog kad ga tok traži).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  /** Kad je zadano, dijalog prikazuje polje za razlog. */
  reason?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
  };
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  reason,
  confirmLabel,
  cancelLabel,
  destructive,
  pending,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue('');
      setBusy(false);
    }
  }, [open]);

  const trimmed = value.trim();
  const missingReason = !!reason?.required && trimmed.length === 0;
  const isPending = !!pending || busy;

  const submit = async () => {
    if (missingReason || isPending) return;
    setBusy(true);
    try {
      await onConfirm(reason ? trimmed || undefined : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {reason && (
          <div className="space-y-1.5 py-1">
            <Label htmlFor="confirm-reason" className="text-xs">
              {reason.label}
            </Label>
            <Input
              id="confirm-reason"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={reason.maxLength ?? 200}
              placeholder={reason.placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            {cancelLabel ?? t('common.cancel', 'Odustani')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={submit}
            disabled={isPending || missingReason}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
