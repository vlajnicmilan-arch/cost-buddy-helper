import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecurringTransactions, RecurringTransaction } from '@/hooks/useRecurringTransactions';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { getCategoryInfo, INCOME_CATEGORIES } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { RecurringTransactionDialog } from './RecurringTransactionDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Repeat, Pencil, Trash2, Calendar, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';
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

interface RecurringTransactionsPanelProps {
  onClose?: () => void;
}

export const RecurringTransactionsPanel = ({ onClose }: RecurringTransactionsPanelProps) => {
  const { t } = useTranslation();
  const { hasAccess, getRequiredTier } = useFeatureAccess();
  const { recurringTransactions, loading, addRecurring, updateRecurring, deleteRecurring, toggleActive } = useRecurringTransactions();
  const { customPaymentSources } = useCustomPaymentSources();
  const { formatAmount } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<RecurringTransaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (!hasAccess('recurring_transactions')) {
    return <UpgradePrompt feature={t('recurring.title', 'Ponavljajuće transakcije')} requiredTier={getRequiredTier('recurring_transactions')} />;
  }

  const FREQ_LABELS: Record<string, string> = {

  const getPaymentSourceName = (source: string | null) => {
    if (!source) return t('paymentSources.cash');
    if (source === 'cash') return t('recurring.cash');
    const cleanId = source.replace('custom:', '');
    const ps = customPaymentSources.find(s => s.id === cleanId);
    return ps ? `${ps.icon} ${ps.name}` : source;
  };

  const getCatDisplay = (type: string, category: string) => {
    if (type === 'income') {
      const ic = INCOME_CATEGORIES.find(c => c.id === category);
      return ic ? `${ic.icon} ${ic.name}` : category;
    }
    if (type === 'transfer') return t('recurring.transferDisplay');
    const info = getCategoryInfo(category as any);
    return `${info.icon} ${info.name}`;
  };

  const handleEdit = (item: RecurringTransaction) => {
    setEditItem(item);
    setDialogOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editItem) {
      await updateRecurring(editItem.id, data);
    } else {
      await addRecurring(data);
    }
    setEditItem(null);
  };

  const activeItems = recurringTransactions.filter(r => r.is_active);
  const inactiveItems = recurringTransactions.filter(r => !r.is_active);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <Repeat className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('recurring.title')}</h2>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => { setEditItem(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> {t('recurring.new')}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            {t('recurring.loading')}
          </div>
        ) : recurringTransactions.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Repeat className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground">{t('recurring.noTransactions')}</p>
            <p className="text-sm text-muted-foreground/70">
              {t('recurring.noTransactionsHint')}
            </p>
            <Button size="sm" variant="outline" className="rounded-xl mt-2" onClick={() => { setEditItem(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> {t('recurring.addFirst')}
            </Button>
          </div>
        ) : (
          <>
            {/* Active */}
            {activeItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('recurring.active')} ({activeItems.length})
                </h3>
                <AnimatePresence>
                  {activeItems.map(item => (
                    <RecurringItem
                      key={item.id}
                      item={item}
                      formatAmount={formatAmount}
                      getPaymentSourceName={getPaymentSourceName}
                      getCatDisplay={getCatDisplay}
                      freqLabels={FREQ_LABELS}
                      overdueLabel={t('recurring.overdue')}
                      onEdit={handleEdit}
                      onDelete={setDeleteId}
                      onToggle={toggleActive}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Inactive */}
            {inactiveItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('recurring.paused')} ({inactiveItems.length})
                </h3>
                {inactiveItems.map(item => (
                  <RecurringItem
                    key={item.id}
                    item={item}
                    formatAmount={formatAmount}
                    getPaymentSourceName={getPaymentSourceName}
                    getCatDisplay={getCatDisplay}
                    freqLabels={FREQ_LABELS}
                    overdueLabel={t('recurring.overdue')}
                    onEdit={handleEdit}
                    onDelete={setDeleteId}
                    onToggle={toggleActive}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog */}
      <RecurringTransactionDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}
        onSave={handleSave}
        editData={editItem}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recurring.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recurring.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (deleteId) deleteRecurring(deleteId); setDeleteId(null); }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface RecurringItemProps {
  item: RecurringTransaction;
  formatAmount: (amount: number) => string;
  getPaymentSourceName: (source: string | null) => string;
  getCatDisplay: (type: string, category: string) => string;
  freqLabels: Record<string, string>;
  overdueLabel: string;
  onEdit: (item: RecurringTransaction) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}

const RecurringItem = ({ item, formatAmount, getPaymentSourceName, getCatDisplay, freqLabels, overdueLabel, onEdit, onDelete, onToggle }: RecurringItemProps) => {
  const isOverdue = item.is_active && new Date(item.next_due_date) <= new Date();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "p-3 rounded-xl border border-border bg-card",
        !item.is_active && "opacity-60",
        isOverdue && "border-warning/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{item.merchant_name || item.description}</span>
            {isOverdue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-medium">
                {overdueLabel}
              </span>
            )}
          </div>
          {item.merchant_name && (
            <p className="text-xs text-muted-foreground truncate">{item.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{getCatDisplay(item.type, item.category)}</span>
            <span>·</span>
            <span>{freqLabels[item.frequency] || item.frequency}</span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Calendar className="w-3 h-3" />
              {new Date(item.next_due_date).toLocaleDateString('hr-HR')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getPaymentSourceName(item.payment_source)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn(
            "text-sm font-mono font-semibold",
            item.type === 'expense' ? 'text-expense' : item.type === 'income' ? 'text-income' : 'text-muted-foreground'
          )}>
            {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}{formatAmount(item.amount)}
          </span>
          <div className="flex items-center gap-1">
            <Switch
              checked={item.is_active}
              onCheckedChange={(checked) => onToggle(item.id, checked)}
              className="scale-75"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(item.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
