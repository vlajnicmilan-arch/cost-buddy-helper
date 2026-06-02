import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CATEGORIES, Category, PAYMENT_SOURCE_GROUPS } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useBudgets } from '@/hooks/useBudgets';
import { useProjects } from '@/hooks/useProjects';
import { Trash2, Settings2, X, CheckSquare, Tag, CreditCard, Target, Folder, Link2 } from 'lucide-react';
import { useManualBankMerge } from '@/hooks/useManualBankMerge';
import { useModuleStates } from '@/hooks/useModuleStates';
import { isModuleActive } from '@/lib/moduleVisibility';
import type { MergeCandidateExpense } from '@/lib/manualBankMergePair';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
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
import { BulkAssignSheet, BulkAssignOption } from './BulkAssignSheet';

type Field = 'category' | 'paymentSource' | 'budget' | 'project';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  totalCount: number;
  onBulkCategoryChange: (category: Category) => Promise<void>;
  onBulkPaymentSourceChange: (paymentSource: string) => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onBulkBudgetChange?: (budgetId: string | null) => Promise<void>;
  onBulkProjectChange?: (projectId: string | null) => Promise<void>;
  showCategoryChange?: boolean;
  showPaymentSourceChange?: boolean;
  showBudgetChange?: boolean;
  showProjectChange?: boolean;
  /** Selected expense objects (needed for manual ↔ bank merge validation). */
  selectedExpenses?: readonly MergeCandidateExpense[];
  /** Show the "Spoji" (manual ↔ bank merge) button when 2 are selected. */
  showMerge?: boolean;
}

export const BulkActionsToolbar = ({
  selectedCount,
  onClearSelection,
  onSelectAll,
  totalCount,
  onBulkCategoryChange,
  onBulkPaymentSourceChange,
  onBulkDelete,
  onBulkBudgetChange,
  onBulkProjectChange,
  showCategoryChange = true,
  showPaymentSourceChange = true,
  showBudgetChange = true,
  showProjectChange = true,
  selectedExpenses,
  showMerge = true,
}: BulkActionsToolbarProps) => {
  const { t } = useTranslation();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [activeField, setActiveField] = useState<Field | null>(null);
  const { customPaymentSources } = useCustomPaymentSources();
  const { budgets } = useBudgets();
  const { projects } = useProjects();
  const { mergePair, checkSelection, isMerging } = useManualBankMerge();

  const mergeCheck = useMemo(
    () => (showMerge && selectedExpenses ? checkSelection(selectedExpenses) : null),
    [showMerge, selectedExpenses, checkSelection]
  );
  const showMergeButton = showMerge && selectedCount === 2 && !!selectedExpenses;
  const mergeDisabled = !mergeCheck?.ok || isMerging;
  const mergeReason = mergeCheck && mergeCheck.ok === false ? t(mergeCheck.reason, '') : '';

  const canBudget = showBudgetChange && !!onBulkBudgetChange;
  const canProject = showProjectChange && !!onBulkProjectChange;
  const hasMenu = showCategoryChange || showPaymentSourceChange || canBudget || canProject;

  const actionOptions: BulkAssignOption[] = useMemo(() => {
    const options: BulkAssignOption[] = [];
    if (showCategoryChange) {
      options.push({ id: 'category', label: t('bulk.category_label', 'Kategorija'), icon: <Tag className="w-4 h-4" /> });
    }
    if (showPaymentSourceChange) {
      options.push({ id: 'paymentSource', label: t('bulk.payment', 'Plaćanje'), icon: <CreditCard className="w-4 h-4" /> });
    }
    if (canBudget) {
      options.push({ id: 'budget', label: t('bulk.budget_label', 'Budžet'), icon: <Target className="w-4 h-4" /> });
    }
    if (canProject) {
      options.push({ id: 'project', label: t('bulk.project_label', 'Projekt'), icon: <Folder className="w-4 h-4" /> });
    }
    return options;
  }, [canBudget, canProject, showCategoryChange, showPaymentSourceChange, t]);

  const categoryOptions: BulkAssignOption[] = useMemo(
    () =>
      CATEGORIES.map((cat) => ({
        id: cat.id,
        label: cat.name,
        icon: <span className="text-lg">{cat.icon}</span>,
      })),
    []
  );

  const paymentSourceOptions: BulkAssignOption[] = useMemo(() => {
    const customs: BulkAssignOption[] = customPaymentSources.map((source) => ({
      id: `custom:${source.id}`,
      label: source.name,
      icon: (
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
          style={{ backgroundColor: source.color + '30', color: source.color }}
        >
          {source.icon}
        </span>
      ),
    }));
    const presets: BulkAssignOption[] = PAYMENT_SOURCE_GROUPS.flatMap((group) =>
      group.sources.map((source) => ({
        id: source.id,
        label: source.name,
        icon: <span className="text-lg">{source.icon}</span>,
        hint: group.label,
      }))
    );
    return [...customs, ...presets];
  }, [customPaymentSources]);

  const budgetOptions: BulkAssignOption[] = useMemo(
    () =>
      (budgets ?? [])
        .filter((b: any) => b.is_active !== false)
        .map((b: any) => ({
          id: b.id,
          label: b.name,
          icon: b.icon ? <span className="text-lg">{b.icon}</span> : <Target className="w-4 h-4" />,
        })),
    [budgets]
  );

  const projectOptions: BulkAssignOption[] = useMemo(
    () =>
      (projects ?? [])
        .filter((p: any) => p.status !== 'completed' && p.status !== 'archived')
        .map((p: any) => ({
          id: p.id,
          label: p.name,
          icon: <Folder className="w-4 h-4" />,
          hint: p.status,
        })),
    [projects]
  );

  const wrap = (fn: () => Promise<void>) => async () => {
    setIsProcessing(true);
    try {
      await fn();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = wrap(async () => {
    await onBulkDelete();
    setDeleteConfirmOpen(false);
  });

  const handleMerge = async () => {
    if (!mergeCheck || !mergeCheck.ok) return;
    const ok = await mergePair(mergeCheck.manual.id, mergeCheck.bank.id);
    setMergeConfirmOpen(false);
    if (ok) onClearSelection();
  };

  const handleSelect = async (field: Field, id: string | null) => {
    if (field === 'category' && id) await onBulkCategoryChange(id as Category);
    else if (field === 'paymentSource' && id) await onBulkPaymentSourceChange(id);
    else if (field === 'budget' && onBulkBudgetChange) await onBulkBudgetChange(id);
    else if (field === 'project' && onBulkProjectChange) await onBulkProjectChange(id);
  };

  const sheetTitle = (() => {
    switch (activeField) {
      case 'category': return t('bulk.category_label', 'Kategorija');
      case 'paymentSource': return t('bulk.payment', 'Plaćanje');
      case 'budget': return t('bulk.budget_label', 'Budžet');
      case 'project': return t('bulk.project_label', 'Projekt');
      default: return '';
    }
  })();

  const sheetOptions = (() => {
    switch (activeField) {
      case 'category': return categoryOptions;
      case 'paymentSource': return paymentSourceOptions;
      case 'budget': return budgetOptions;
      case 'project': return projectOptions;
      default: return [];
    }
  })();

  const allowClear = activeField === 'budget' || activeField === 'project';
  const clearLabel = activeField === 'budget'
    ? t('bulk.removeBudget', 'Ukloni dodjelu budžeta')
    : activeField === 'project'
      ? t('bulk.removeProject', 'Ukloni dodjelu projekta')
      : undefined;

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {t('bulk.selected', { count: selectedCount, total: totalCount })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 text-xs">
                  {t('bulk.selectAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 text-xs">
                  <X className="w-3 h-3 mr-1" />
                  {t('bulk.deselect')}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {hasMenu && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-2 bg-background min-w-[44px]"
                  onClick={() => setActionPickerOpen(true)}
                  disabled={isProcessing}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {t('bulk.bulkChange')}
                </Button>
              )}

              {showMergeButton && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs gap-2 bg-background min-w-[44px]"
                          onClick={() => setMergeConfirmOpen(true)}
                          disabled={mergeDisabled || isProcessing}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {t('transactions.merge.button', 'Spoji')}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {mergeDisabled && mergeReason && (
                      <TooltipContent side="top">{mergeReason}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}

              <Button
                variant="destructive"
                size="sm"
                className="h-9 text-xs"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isProcessing}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {t('bulk.deleteCount', { count: selectedCount })}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkAssignSheet
        open={actionPickerOpen}
        onOpenChange={setActionPickerOpen}
        title={t('bulk.bulkChange')}
        options={actionOptions}
        onSelect={(id) => {
          if (id) setActiveField(id as Field);
        }}
      />

      <BulkAssignSheet
        open={activeField !== null}
        onOpenChange={(o) => { if (!o) setActiveField(null); }}
        title={sheetTitle}
        options={sheetOptions}
        onSelect={async (id) => {
          if (activeField) await handleSelect(activeField, id);
        }}
        allowClear={allowClear}
        clearLabel={clearLabel}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bulk.deleteConfirmTitle', { count: selectedCount })}</AlertDialogTitle>
            <AlertDialogDescription>{t('bulk.deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessing}
            >
              {isProcessing ? t('bulk.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.merge.confirmTitle', 'Spojiti ručnu transakciju s onom iz banke?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.merge.confirmBody', 'Ručna transakcija će preuzeti podatke iz banke i biti označena kao potvrđena. Bankovni zapis ide u smeće (možeš ga vratiti).')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMerging}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={isMerging}>
              {isMerging ? t('transactions.merge.merging', 'Spajam…') : t('transactions.merge.button', 'Spoji')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
