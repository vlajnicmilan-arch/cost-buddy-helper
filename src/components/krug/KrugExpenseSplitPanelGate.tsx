/**
 * Gate koji izračuna ulogu (owner/punopravni ili obični) i renderira panel.
 * Odvojeno da EditTransactionDialog ostane čist.
 *
 * `allowPropose=false` koristi PREGLED transakcije (read-only kontekst):
 * panel tamo prikazuje trenutnu i predloženu podjelu te Potvrdi/Odbij, ali
 * ne nudi kreiranje novog prijedloga (to ostaje u edit sloju, autoru).
 */
import { useAuth } from '@/hooks/useAuth';
import { useKrugMembers } from '@/hooks/useKrug';
import { KrugExpenseSplitPanel } from './KrugExpenseSplitPanel';

interface Props {
  krugId: string;
  expenseId: string;
  allowPropose?: boolean;
  expenseAmount: number;
  currency: string;
}

export function KrugExpenseSplitPanelGate({ krugId, expenseId, allowPropose = true, expenseAmount, currency }: Props) {
  const { user } = useAuth();
  const { data: members = [] } = useKrugMembers(krugId);
  const me = user ? members.find((m) => m.user_id === user.id) : undefined;
  const isFullMember = !!me && (me.kind === 'owner' || me.kind === 'punopravni');
  // Obični član: samo prijedlozi u kojima ima udio (potvrdi/odbij), nikad novi prijedlog.
  const isRegularMember = !!me && me.kind === 'obicni';
  if (!isFullMember && !isRegularMember) return null;
  return (
    <KrugExpenseSplitPanel
      krugId={krugId}
      expenseId={expenseId}
      isFullMember={isFullMember}
      isRegularMember={isRegularMember}
      allowPropose={isFullMember && allowPropose}
      expenseAmount={expenseAmount}
      currency={currency}
    />
  );
}
