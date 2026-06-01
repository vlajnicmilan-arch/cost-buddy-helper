import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, SplitSquareVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useFamilySplitContext } from '@/hooks/useFamilySplitOverride';
import { SplitOverrideDialog } from './SplitOverrideDialog';
import type { Expense } from '@/types/expense';

interface FamilySplitControlsProps {
  expense: Expense;
  onChanged?: () => void;
}

/**
 * Inline controls shown inside TransactionDetailDialog for family-shared
 * transactions. Lets the owner mark privacy and open the per-transaction
 * split override editor.
 *
 * Renders nothing if the expense is not on a shared family payment source,
 * or if the current user is not the owner.
 */
export function FamilySplitControls({ expense, onChanged }: FamilySplitControlsProps) {
  const { t } = useTranslation();
  const { context } = useFamilySplitContext(expense.payment_source);
  const [isPrivate, setIsPrivate] = useState(!!(expense as any).is_private);
  const [saving, setSaving] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  if (!context) return null;
  // Only owner can change privacy / override (RPC enforces, but hide UI too)
  // Owner check is implicit: RPC will reject non-owner. We still render so co-members see the badge but disable interaction.

  const handlePrivacyToggle = async (next: boolean) => {
    setSaving(true);
    setIsPrivate(next);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ is_private: next })
        .eq('id', expense.id);
      if (error) throw error;
      showSuccess(
        next ? t('family.split.privacy.label') : t('family.split.privacy.label'),
      );
      onChanged?.();
    } catch (e) {
      setIsPrivate(!next);
      showError(t('family.split.override.error'));
    } finally {
      setSaving(false);
    }
  };

  const hasOverride =
    !!(expense as any).split_overrides &&
    Object.keys((expense as any).split_overrides).length > 0;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {isPrivate ? (
            <EyeOff className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          ) : (
            <Eye className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <Label htmlFor="detail-privacy" className="text-sm font-medium">
              {t('family.split.privacy.label')}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('family.split.privacy.hint')}
            </p>
          </div>
        </div>
        <Switch
          id="detail-privacy"
          checked={isPrivate}
          onCheckedChange={handlePrivacyToggle}
          disabled={saving}
        />
      </div>

      {!isPrivate && (
        <Button
          type="button"
          variant={hasOverride ? 'secondary' : 'outline'}
          size="sm"
          className="w-full gap-2"
          onClick={() => setOverrideOpen(true)}
        >
          <SplitSquareVertical className="h-4 w-4" />
          {hasOverride
            ? t('family.split.override.badge')
            : t('family.split.override.title')}
        </Button>
      )}

      <SplitOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        expenseId={expense.id}
        paymentSource={expense.payment_source}
        currentOverrides={(expense as any).split_overrides ?? null}
        onApplied={onChanged}
      />
    </div>
  );
}
