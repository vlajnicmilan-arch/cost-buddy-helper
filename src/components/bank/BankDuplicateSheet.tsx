import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Expense } from '@/types/expense';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  bankExpense: Expense | null;
  onClose: () => void;
  onResolved?: () => void;
}

/**
 * Hybrid bank-first fallback UI — prikazuje se samo kad je `possible_duplicate_of`
 * postavljen (>1 kandidata pri bank syncu). Korisnik bira:
 *  - Spoji: UPDATE postojeću u 'confirmed' (preuzima bank_transaction_id),
 *           DELETE bank_only zapis.
 *  - Nisu isto: clear `possible_duplicate_of`, ostaje kao samostalan bank_only.
 */
export function BankDuplicateSheet({ open, bankExpense, onClose, onResolved }: Props) {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [candidate, setCandidate] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!bankExpense?.possible_duplicate_of) { setCandidate(null); return; }
      setLoading(true);
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', bankExpense.possible_duplicate_of)
        .maybeSingle();
      if (!cancelled) {
        setCandidate(data ? { ...(data as any), date: new Date((data as any).date) } : null);
        setLoading(false);
      }
    }
    if (open) load();
    return () => { cancelled = true; };
  }, [open, bankExpense?.possible_duplicate_of]);

  const handleMerge = async () => {
    if (!bankExpense || !candidate) return;
    setWorking(true);
    try {
      const { error: updErr } = await supabase
        .from('expenses')
        .update({
          bank_transaction_id: bankExpense.bank_transaction_id,
          bank_account_id: bankExpense.bank_account_id,
          bank_match_status: 'confirmed',
        })
        .eq('id', candidate.id);
      if (updErr) throw updErr;

      // Soft-delete bank_only zapis (koristi RPC zbog RLS).
      const { error: delErr } = await supabase.rpc('soft_delete_record', {
        p_table: 'expenses',
        p_id: bankExpense.id,
      });
      if (delErr) throw delErr;

      showSuccess(t('bankMatch.merged'));
      onResolved?.();
      onClose();
    } catch (e: any) {
      console.error('[BankDuplicateSheet] merge error', e);
      showError(t('bankMatch.mergeError'));
    } finally {
      setWorking(false);
    }
  };

  const handleDismiss = async () => {
    if (!bankExpense) return;
    setWorking(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ possible_duplicate_of: null })
        .eq('id', bankExpense.id);
      if (error) throw error;
      showSuccess(t('bankMatch.dismissed'));
      onResolved?.();
      onClose();
    } catch (e: any) {
      console.error('[BankDuplicateSheet] dismiss error', e);
      showError(t('bankMatch.dismissError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="z-[60]">
        <SheetHeader>
          <SheetTitle>{t('bankMatch.duplicateTitle')}</SheetTitle>
          <SheetDescription>{t('bankMatch.duplicateDescription')}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">{t('bankMatch.bankTransaction')}</p>
              <p className="font-medium text-sm truncate">{bankExpense?.merchant_name || bankExpense?.description}</p>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{bankExpense?.date ? new Date(bankExpense.date).toLocaleDateString() : ''}</span>
                <span>{bankExpense ? formatAmount(bankExpense.amount) : ''}</span>
              </div>
            </div>
            {candidate && (
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">{t('bankMatch.existingTransaction')}</p>
                <p className="font-medium text-sm truncate">{candidate.merchant_name || candidate.description}</p>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{candidate.date ? new Date(candidate.date).toLocaleDateString() : ''}</span>
                  <span>{formatAmount(candidate.amount)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 min-h-11" onClick={handleDismiss} disabled={working || loading}>
            {t('bankMatch.notSame')}
          </Button>
          <Button className="flex-1 min-h-11" onClick={handleMerge} disabled={working || loading || !candidate}>
            {t('bankMatch.merge')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
