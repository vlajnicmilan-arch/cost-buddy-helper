import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Loader2, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface BudgetRevision {
  id: string;
  previous_amount: number;
  new_amount: number;
  reason: string | null;
  created_at: string;
}

interface ProjectBudgetHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export const ProjectBudgetHistoryDialog = ({
  open,
  onOpenChange,
  projectId,
}: ProjectBudgetHistoryDialogProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [revisions, setRevisions] = useState<BudgetRevision[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRevisions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from('project_budget_revisions') as any)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRevisions((data || []).map((r: any) => ({
        ...r,
        previous_amount: Number(r.previous_amount) || 0,
        new_amount: Number(r.new_amount) || 0,
      })));
    } catch (error) {
      console.error('Error fetching budget revisions:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) fetchRevisions();
  }, [open, fetchRevisions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.budgetHistory', 'Povijest budžeta')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : revisions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t('projects.noBudgetChanges', 'Nema promjena budžeta')}
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {revisions.map((rev) => {
              const diff = rev.new_amount - rev.previous_amount;
              const isIncrease = diff >= 0;

              return (
                <div key={rev.id} className="p-3 rounded-lg border space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{formatAmount(rev.previous_amount)}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{formatAmount(rev.new_amount)}</span>
                    </div>
                    <span className={cn(
                      "text-sm font-medium flex items-center gap-1",
                      isIncrease ? "text-income" : "text-destructive"
                    )}>
                      {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {isIncrease ? '+' : ''}{formatAmount(diff)}
                    </span>
                  </div>
                  {rev.reason && (
                    <p className="text-xs text-muted-foreground">{rev.reason}</p>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    {format(new Date(rev.created_at), 'd. MMM yyyy HH:mm', { locale: hr })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
