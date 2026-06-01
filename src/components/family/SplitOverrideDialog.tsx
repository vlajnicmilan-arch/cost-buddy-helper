import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useFamilySplitContext, useFamilySplitOverride, type SplitMemberOption } from '@/hooks/useFamilySplitOverride';
import { showError } from '@/hooks/useStatusFeedback';

interface SplitOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId: string;
  paymentSource: string | null | undefined;
  currentOverrides?: Record<string, number> | null;
  onApplied?: () => void;
}

/**
 * Per-transaction split override editor. Shown from TransactionDetailDialog
 * when the expense lives on a shared family payment source.
 *
 * Sum of shares must equal 100 (server validates 0.99–1.01).
 * Empty/cleared submit → removes the override.
 */
export function SplitOverrideDialog({
  open,
  onOpenChange,
  expenseId,
  paymentSource,
  currentOverrides,
  onApplied,
}: SplitOverrideDialogProps) {
  const { t } = useTranslation();
  const { context, loading } = useFamilySplitContext(paymentSource);
  const { apply, saving } = useFamilySplitOverride();
  const [shares, setShares] = useState<Record<string, string>>({});

  // Initialize shares whenever the dialog opens / context resolves
  useEffect(() => {
    if (!open || !context) return;
    const init: Record<string, string> = {};
    const equal = +(100 / Math.max(context.members.length, 1)).toFixed(2);
    for (const m of context.members) {
      const existing = currentOverrides?.[m.user_id];
      init[m.user_id] = existing != null ? (existing * 100).toFixed(2) : equal.toFixed(2);
    }
    setShares(init);
  }, [open, context, currentOverrides]);

  const sum = useMemo(
    () =>
      Object.values(shares).reduce((acc, v) => {
        const n = parseFloat(v);
        return acc + (isNaN(n) ? 0 : n);
      }, 0),
    [shares],
  );

  const sumRounded = Math.round(sum * 100) / 100;
  const sumValid = sumRounded >= 99 && sumRounded <= 101;

  const handleSave = async () => {
    if (!context) return;
    if (!sumValid) {
      showError(t('family.split.override.mustSum', { sum: sumRounded.toFixed(2) }));
      return;
    }
    const overrides: Record<string, number> = {};
    for (const [uid, raw] of Object.entries(shares)) {
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0 || n > 100) {
        showError(t('family.split.override.outOfRange'));
        return;
      }
      overrides[uid] = +(n / 100).toFixed(6);
    }
    const ok = await apply(expenseId, overrides);
    if (ok) {
      onApplied?.();
      onOpenChange(false);
    }
  };

  const handleRemove = async () => {
    const ok = await apply(expenseId, null);
    if (ok) {
      onApplied?.();
      onOpenChange(false);
    }
  };

  const initials = (m: SplitMemberOption) =>
    (m.display_name || m.user_id).slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md z-[60]">
        <DialogHeader>
          <DialogTitle>{t('family.split.override.title')}</DialogTitle>
          <DialogDescription>{t('family.split.override.description')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">…</div>
        ) : !context ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t('family.split.override.notFamilySource')}
          </div>
        ) : (
          <div className="space-y-3">
            {context.members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                  <AvatarFallback>{initials(m)}</AvatarFallback>
                </Avatar>
                <Label className="flex-1 text-sm truncate">
                  {m.display_name || t('family.split.override.member')}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  inputMode="decimal"
                  className="w-24 text-right"
                  value={shares[m.user_id] ?? ''}
                  onChange={(e) =>
                    setShares((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                  }
                />
                <span className="text-xs text-muted-foreground w-4">%</span>
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-3 mt-2">
              <span className="text-sm font-medium">{t('family.split.override.sum')}</span>
              <span
                className={`text-sm font-mono ${sumValid ? 'text-emerald-600' : 'text-destructive'}`}
              >
                {sumRounded.toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {currentOverrides ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={saving}
              className="mr-auto"
            >
              {t('family.split.override.remove')}
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={saving || loading || !context || !sumValid}
          >
            {t('family.split.override.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
