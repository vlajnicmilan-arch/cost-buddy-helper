/**
 * Gate koji izračuna isFullMember (owner ili punopravni) i renderira panel.
 * Odvojeno da EditTransactionDialog ostane čist.
 */
import { useAuth } from '@/hooks/useAuth';
import { useKrugMembers } from '@/hooks/useKrug';
import { KrugExpenseSplitPanel } from './KrugExpenseSplitPanel';

interface Props {
  krugId: string;
  expenseId: string;
}

export function KrugExpenseSplitPanelGate({ krugId, expenseId }: Props) {
  const { user } = useAuth();
  const { data: members = [] } = useKrugMembers(krugId);
  const isFullMember = !!user && members.some(
    (m) => m.user_id === user.id && (m.kind === 'owner' || m.kind === 'punopravni'),
  );
  if (!isFullMember) return null;
  return <KrugExpenseSplitPanel krugId={krugId} expenseId={expenseId} isFullMember />;
}
