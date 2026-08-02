/**
 * UnassignedMilestoneDialog — "Troškovi bez faze".
 *
 * Radna lista za naknadno razvrstavanje: prikazuje transakcije projekta bez
 * faze, poredane po iznosu SILAZNO, jer nekoliko najvećih stavki obično nosi
 * većinu iznosa — korisnik razvrsta dvadesetak najvećih i već ima smislenu
 * sliku po fazama.
 *
 * Dodjela ide inline (bez otvaranja svake transakcije) i mijenja ISKLJUČIVO
 * `milestone_id`. Iznos, izvor plaćanja, status i saldo se ne diraju, pa ovaj
 * put ne dodiruje motor salda niti korak E (potvrđivanje).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import type { ProjectMilestone } from '@/types/project';
import type { ProjectExpense } from './types';

interface UnassignedMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  formatAmount: (n: number) => string;
  isManager: boolean;
  userId: string | undefined;
  isReadOnly?: boolean;
  onAssigned: () => void;
}

/** Transakcije bez faze, silazno po iznosu. Transferi ne ulaze u fazne zbrojeve. */
export const selectUnassignedExpenses = (expenses: ProjectExpense[]): ProjectExpense[] =>
  expenses
    .filter((e) => !e.milestone_id && e.type !== 'transfer' && e.status !== 'rejected')
    .slice()
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

export const UnassignedMilestoneDialog = ({
  open,
  onOpenChange,
  expenses,
  milestones,
  formatAmount,
  isManager,
  userId,
  isReadOnly = false,
  onAssigned,
}: UnassignedMilestoneDialogProps) => {
  const { t } = useTranslation();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string>>({});

  const rows = useMemo(() => selectUnassignedExpenses(expenses), [expenses]);
  const totalUnassigned = useMemo(
    () => rows.reduce((sum, e) => sum + Math.abs(e.amount), 0),
    [rows],
  );

  const handleAssign = async (expense: ProjectExpense, milestoneId: string) => {
    setSavingId(expense.id);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ milestone_id: milestoneId } as any)
        .eq('id', expense.id);
      if (error) throw error;
      setAssigned((prev) => ({ ...prev, [expense.id]: milestoneId }));
      showSuccess(t('common.saved', 'Spremljeno'));
      onAssigned();
    } catch (e) {
      console.error('Assign milestone failed:', e);
      showError(t('common.error'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{t('projects.unassignedMilestone.title', 'Troškovi bez faze')}</DialogTitle>
          <DialogDescription>
            {t('projects.unassignedMilestone.subtitle', 'Poredano po iznosu, od najvećeg.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t('projects.unassignedMilestone.empty', 'Sve transakcije imaju fazu.')}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t('projects.unassignedMilestone.summary', '{{count}} stavki • {{amount}}', {
                  count: rows.length,
                  amount: formatAmount(totalUnassigned),
                })}
              </p>
              {rows.map((expense) => {
                const authorId = expense.submitted_by || expense.user_id;
                const canAssign = !isReadOnly && (isManager || authorId === userId);
                const value = assigned[expense.id] ?? '';
                return (
                  <div key={expense.id} className="rounded-lg border p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{expense.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(expense.date), 'd. MMM yyyy', { locale: hr })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold shrink-0',
                          expense.type === 'income' ? 'text-income' : 'text-expense',
                        )}
                      >
                        {expense.type === 'income' ? '+' : '-'}
                        {formatAmount(Math.abs(expense.amount))}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={value}
                        disabled={!canAssign || savingId === expense.id}
                        onValueChange={(v) => handleAssign(expense, v)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder={t('transactions.noMilestone', 'Bez faze')} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-[70]">
                          {milestones.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {savingId === expense.id && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
