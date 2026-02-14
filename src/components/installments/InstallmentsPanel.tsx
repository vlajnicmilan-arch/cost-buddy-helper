import { useState } from 'react';
import { useInstallments } from '@/hooks/useInstallments';
import { useCurrency } from '@/contexts/CurrencyContext';
import { InstallmentPlanWithProgress, Installment } from '@/types/installment';
import { getCategoryInfo } from '@/types/expense';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  ChevronRight,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isAfter, isBefore, startOfToday } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface InstallmentDetailContentProps {
  plan: InstallmentPlanWithProgress;
  onMarkPaid: (id: string) => void;
  onMarkUnpaid: (id: string) => void;
  onDelete: (id: string) => void;
}

const InstallmentDetailContent = ({ plan, onMarkPaid, onMarkUnpaid, onDelete }: InstallmentDetailContentProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const today = startOfToday();
  const categoryInfo = getCategoryInfo(plan.category as any);
  
  const installments = plan.installments || [];

  return (
    <>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{categoryInfo.icon}</span>
            {plan.description}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">{t('installments.total', 'Ukupno')}</p>
              <p className="text-lg font-bold">{formatAmount(plan.total_amount)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">{t('installments.remaining', 'Preostalo')}</p>
              <p className="text-lg font-bold text-primary">{formatAmount(plan.remainingAmount)}</p>
            </div>
          </div>
          
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('installments.progress', 'Napredak')}</span>
              <span className="font-medium">{plan.paidCount}/{plan.totalCount} {t('installments.installment', 'rata')}</span>
            </div>
            <Progress value={(plan.paidCount / plan.totalCount) * 100} className="h-2" />
          </div>
          
          {/* Installments List */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">{t('installments.allInstallments', 'Sve rate')}</h4>
            <div className="space-y-1.5">
              {installments.map((installment) => {
                const isPaid = installment.status === 'paid';
                const isOverdue = !isPaid && isBefore(installment.due_date, today);
                const isCurrent = !isPaid && !isOverdue && plan.nextInstallment?.id === installment.id;
                
                return (
                  <motion.div
                    key={installment.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors",
                      isPaid && "bg-income/5 border-income/20",
                      isOverdue && "bg-destructive/5 border-destructive/20",
                      isCurrent && "bg-primary/5 border-primary/20",
                      !isPaid && !isOverdue && !isCurrent && "bg-muted/30 border-border/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => isPaid ? onMarkUnpaid(installment.id) : onMarkPaid(installment.id)}
                        className="hover:scale-110 transition-transform"
                      >
                        {isPaid ? (
                          <CheckCircle2 className="w-5 h-5 text-income" />
                        ) : (
                          <Circle className={cn(
                            "w-5 h-5",
                            isOverdue ? "text-destructive" : "text-muted-foreground"
                          )} />
                        )}
                      </button>
                      <div>
                        <p className={cn(
                          "font-medium text-sm",
                          isPaid && "line-through text-muted-foreground"
                        )}>
                          {t('installments.installment', 'Rata')} {installment.installment_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(installment.due_date, 'd. MMMM yyyy.', { locale: hr })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs">
                          {t('installments.overdue', 'Kasni')}
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge variant="default" className="text-xs bg-primary">
                          {t('installments.next', 'Sljedeća')}
                        </Badge>
                      )}
                      <span className={cn(
                        "font-mono font-semibold",
                        isPaid ? "text-muted-foreground" : "text-foreground"
                      )}>
                        {formatAmount(installment.amount)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="pt-4 border-t">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t('installments.deletePlan', 'Obriši plan')}
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('installments.deleteConfirmTitle', 'Obrisati plan plaćanja?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('installments.deleteConfirmMessage', 'Ova radnja će trajno obrisati plan i sve povezane rate. Ovo se ne može poništiti.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(plan.id);
                setDeleteDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const InstallmentsPanel = () => {
  const { plans, loading, markInstallmentPaid, markInstallmentUnpaid, deletePlan } = useInstallments();
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlanWithProgress | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate totals for collapsed view
  const totalRemaining = plans.reduce((sum, plan) => sum + plan.remainingAmount, 0);
  const totalPlans = plans.length;

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('installments.title', 'Plaćanja na rate')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('installments.title', 'Plaćanja na rate')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('installments.noPlans', 'Nema aktivnih planova plaćanja na rate')}</p>
            <p className="text-xs mt-1">{t('installments.addHint', 'Dodaj novi trošak ili prihod i odaberi opciju "Na rate"')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50">
      <motion.div
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t('installments.title', 'Plaćanja na rate')}
            <Badge variant="secondary" className="ml-2">
              {totalPlans}
            </Badge>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm font-normal text-muted-foreground">
                {formatAmount(totalRemaining)} {t('installments.remainingShort', 'preostalo')}
              </span>
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </motion.div>
            </div>
          </CardTitle>
        </CardHeader>
      </motion.div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent className="space-y-3 pt-0">
              <AnimatePresence mode="popLayout">
                {plans.map((plan) => {
                  const categoryInfo = getCategoryInfo(plan.category as any);
                  const progressPercent = (plan.paidCount / plan.totalCount) * 100;
                  
                  return (
                    <Dialog key={plan.id}>
                      <DialogTrigger asChild>
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          whileHover={{ scale: 1.01 }}
                          className="p-4 rounded-xl border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlan(plan);
                          }}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                                style={{ backgroundColor: `hsl(var(--${categoryInfo.color}) / 0.1)` }}
                              >
                                {categoryInfo.icon}
                              </div>
                              <div>
                                <p className="font-medium">{plan.description}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {plan.type === 'expense' ? (
                                    <TrendingDown className="w-3 h-3 text-expense" />
                                  ) : (
                                    <TrendingUp className="w-3 h-3 text-income" />
                                  )}
                                  <span>{formatAmount(plan.total_amount)}</span>
                                </div>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {t('installments.rataProgress', 'Rata {{current}}/{{total}}', { 
                                  current: plan.paidCount, 
                                  total: plan.totalCount 
                                })}
                              </span>
                              <span className="font-medium text-primary">
                                {formatAmount(plan.remainingAmount)} {t('installments.remainingShort', 'preostalo')}
                              </span>
                            </div>
                            <Progress value={progressPercent} className="h-1.5" />
                            
                            {plan.nextInstallment && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {t('installments.nextPayment', 'Sljedeća rata')}: {format(plan.nextInstallment.due_date, 'd. MMM', { locale: hr })} • {formatAmount(plan.nextInstallment.amount)}
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </DialogTrigger>
                      <InstallmentDetailContent
                        plan={plan}
                        onMarkPaid={markInstallmentPaid}
                        onMarkUnpaid={markInstallmentUnpaid}
                        onDelete={deletePlan}
                      />
                    </Dialog>
                  );
                })}
              </AnimatePresence>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};
