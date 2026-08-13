/**
 * Detalj transakcije — promjena knjiženja poslovnog troška plaćenog osobnim
 * izvorom: pozajmica vlasnika ↔ materijalni trošak firme.
 *
 * Odluka je uvijek korisnikova; ovaj red je nikad ne donosi sam.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { HandCoins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { createOwnerLoanIfCrossMode, deleteOwnerLoanForExpense } from '@/lib/ownerLoanLogic';

interface Props {
  expenseId: string;
  userId: string | null | undefined;
  businessProfileId: string | null | undefined;
  paymentSource: string | null | undefined;
  amount: number;
  description: string;
  /** Trenutni izbor; NULL se prikazuje kao pozajmica (staro ponašanje). */
  value: 'owner_loan' | 'material' | null | undefined;
}

export const OwnerFundingChoiceRow = ({
  expenseId,
  userId,
  businessProfileId,
  paymentSource,
  amount,
  description,
  value,
}: Props) => {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<'owner_loan' | 'material'>(value === 'material' ? 'material' : 'owner_loan');
  const [busy, setBusy] = useState(false);

  const apply = async (next: 'owner_loan' | 'material') => {
    if (next === choice || busy || !userId || !businessProfileId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ owner_funding_choice: next } as never)
        .eq('id', expenseId);
      if (error) throw error;

      if (next === 'material') {
        await deleteOwnerLoanForExpense(expenseId);
      } else {
        await createOwnerLoanIfCrossMode({
          expenseId,
          userId,
          businessProfileId,
          paymentSource,
          amount,
          description,
        });
      }
      setChoice(next);
      showSuccess(t('transactions.fundingChoiceSaved', 'Knjiženje ažurirano'));
    } catch (e) {
      console.error('[OwnerFundingChoiceRow] update failed', e);
      showError(t('common.error', 'Greška'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 col-span-2" data-testid="owner-funding-choice-row">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <HandCoins className="w-4 h-4 shrink-0" />
        <span className="text-xs">{t('transactions.fundingChoiceTitle', 'Plaćeno osobnim izvorom')}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          type="button"
          size="sm"
          className="h-9"
          variant={choice === 'owner_loan' ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => apply('owner_loan')}
        >
          {t('scanner.routing.choiceOwnerLoan', 'Pozajmica vlasnika')}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9"
          variant={choice === 'material' ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => apply('material')}
        >
          {t('scanner.routing.choiceMaterial', 'Materijalni trošak')}
        </Button>
      </div>
    </div>
  );
};
