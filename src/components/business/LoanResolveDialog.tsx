import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HandHeart, RefreshCcw, Trash2, Loader2 } from 'lucide-react';
import { BusinessDebt } from '@/types/businessDebt';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';
import { forgiveOwnerLoan, syncOwnerLoanForExpense } from '@/lib/ownerLoanLogic';
import { coerceCanonicalShape } from '@/lib/paymentSource/normalize';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  debt: BusinessDebt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
  onDelete: (id: string) => Promise<void> | void;
}

type Mode = 'menu' | 'changeSource';

export const LoanResolveDialog = ({ debt, open, onOpenChange, onResolved, onDelete }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { customPaymentSources } = useCustomPaymentSources();
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [newSourceId, setNewSourceId] = useState<string>('');

  const hasExpense = !!debt?.source_expense_id;

  const businessSources = useMemo(
    () => customPaymentSources.filter((s: any) => s.business_profile_id === activeBusinessProfileId),
    [customPaymentSources, activeBusinessProfileId]
  );

  const reset = () => {
    setMode('menu');
    setNewSourceId('');
    setBusy(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleForgive = async () => {
    if (!debt) return;
    setBusy(true);
    try {
      await forgiveOwnerLoan(debt.id);
      showSuccess(t('business.debts.forgiven', 'Pozajmica otpisana'));
      onResolved();
      close();
    } catch (e) {
      console.error(e);
      showError(t('business.debts.resolveError', 'Greška'));
    } finally {
      setBusy(false);
    }
  };

  const handleChangeSource = async () => {
    if (!debt?.source_expense_id || !newSourceId || !user || !activeBusinessProfileId) return;
    setBusy(true);
    try {
      // Locally constructed canonical value — passes through the shape-only
      // canonicalizer to keep this in sync with the DB CHECK contract.
      const newPaymentSource = coerceCanonicalShape(`custom:${newSourceId}`);

      // Fetch expense to keep amount/description for sync
      const { data: expense, error: fetchErr } = await supabase
        .from('expenses')
        .select('amount, description')
        .eq('id', debt.source_expense_id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!expense) throw new Error('Expense not found');

      // eslint-disable-next-line no-restricted-syntax -- canonical-shaped value, owner-loan source-change is a narrow business-debt fix-up
      const { error: updErr } = await supabase
        .from('expenses')
        .update({ payment_source: newPaymentSource })
        .eq('id', debt.source_expense_id);
      if (updErr) throw updErr;

      await syncOwnerLoanForExpense({
        expenseId: debt.source_expense_id,
        userId: user.id,
        businessProfileId: activeBusinessProfileId,
        paymentSource: newPaymentSource,
        amount: Number((expense as any).amount),
        description: (expense as any).description || '',
      });

      showSuccess(t('business.debts.sourceChanged', 'Izvor promijenjen'));
      onResolved();
      close();
    } catch (e) {
      console.error(e);
      showError(t('business.debts.resolveError', 'Greška'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOnly = async () => {
    if (!debt) return;
    setBusy(true);
    try {
      await onDelete(debt.id);
      onResolved();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4">
        <DialogHeader>
          <DialogTitle className="text-base">
            {mode === 'changeSource'
              ? t('business.debts.chooseSource', 'Odaberi tvrtkin izvor')
              : t('business.debts.resolveTitle', 'Riješi pozajmicu')}
          </DialogTitle>
        </DialogHeader>

        {mode === 'menu' && (
          <div className="space-y-2">
            {hasExpense && (
              <button
                disabled={busy}
                onClick={handleForgive}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex gap-3 items-start disabled:opacity-50"
              >
                <HandHeart className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{t('business.debts.optionForgive', 'Otpiši pozajmicu')}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('business.debts.optionForgiveDesc', 'Vlasnik je donirao tvrtki — transakcija ostaje, obveza nestaje.')}
                  </p>
                </div>
              </button>
            )}

            {hasExpense && businessSources.length > 0 && (
              <button
                disabled={busy}
                onClick={() => setMode('changeSource')}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors flex gap-3 items-start disabled:opacity-50"
              >
                <RefreshCcw className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{t('business.debts.optionChangeSource', 'Promijeni izvor plaćanja')}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('business.debts.optionChangeSourceDesc', 'Prebaci transakciju na tvrtkin izvor — pozajmica nestaje, trošak ostaje samo u tvrtki.')}
                  </p>
                </div>
              </button>
            )}

            <button
              disabled={busy}
              onClick={handleDeleteOnly}
              className="w-full text-left p-3 rounded-lg border border-destructive/30 hover:bg-destructive/5 transition-colors flex gap-3 items-start disabled:opacity-50"
            >
              <Trash2 className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  {hasExpense
                    ? t('business.debts.optionDeleteOnly', 'Obriši samo zapis pozajmice')
                    : t('common.delete', 'Obriši')}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {hasExpense
                    ? t('business.debts.optionDeleteOnlyDesc', 'Briše samo ovu evidenciju — transakcija se ne dira. Za zombie/duple zapise.')
                    : t('business.debts.optionDeleteSimpleDesc', 'Trajno briše ovaj zapis.')}
                </p>
              </div>
            </button>
          </div>
        )}

        {mode === 'changeSource' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('business.debts.changeSourceHint', 'Odaberi tvrtkin izvor s kojeg će biti knjižena ova transakcija.')}
            </p>
            <Select value={newSourceId} onValueChange={setNewSourceId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t('business.debts.pickSource', 'Odaberi izvor')} />
              </SelectTrigger>
              <SelectContent>
                {businessSources.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.icon} {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMode('menu')} disabled={busy}>
                {t('common.back', 'Natrag')}
              </Button>
              <Button onClick={handleChangeSource} disabled={busy || !newSourceId}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save', 'Spremi')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
