import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
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
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { type Category, type TransactionType } from '@/types/expense';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useBalanceUpdater } from '@/hooks/useBalanceUpdater';
import { useExpenses } from '@/hooks/useExpenses';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';
import { useAppState } from '@/contexts/AppStateContext';
import { resolveCategory } from '@/hooks/useResolvedCategory';
import { ProjectMilestone, ProjectRole, ProjectRoleKey } from '@/types/project';
import { useProjectPendingTransactions } from '@/hooks/useProjectPendingTransactions';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { invokeNotifyFunction } from '@/lib/notifyHelper';
import { Loader2, Plus, AlertCircle } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { getDateRange } from '@/lib/dateValidation';
import { Capacitor } from '@capacitor/core';
import { exportTextFile } from '@/lib/fileExport';
import { buildReportHtml, renderHtmlKpiStrip } from '@/lib/printHtmlTemplate';
import { ensureReportLogo } from '@/lib/reportLogo';
import { buildReportFileName } from '@/lib/reportDesign';
import { useReportOwner } from '@/hooks/useReportOwner';
import { useConfidentialityLevel } from '@/components/ConfidentialityPicker';
import { printHtmlDocument } from '@/lib/printHtml';
import {
  filterProjectExpenses,
  computeProjectExpenseTotals,
  hasActiveProjectFilters,
} from '@/lib/projectTransactionFilters';
import { PendingApprovalsStrip } from './project-transactions/PendingApprovalsStrip';
import { ProjectTransactionsFilterBar } from './project-transactions/ProjectTransactionsFilterBar';
import { ProjectTransactionsList } from './project-transactions/ProjectTransactionsList';
import { ProjectTransactionAddDialog } from './project-transactions/ProjectTransactionAddDialog';
import { ProjectTransactionEditDialog } from './project-transactions/ProjectTransactionEditDialog';
import { ProjectTransactionDetailDialog } from './project-transactions/ProjectTransactionDetailDialog';
import type { ProjectExpense } from './project-transactions/types';

interface ProjectTransactionsTabProps {
  projectId: string;
  projectName?: string;
  expenses: ProjectExpense[];
  milestones: ProjectMilestone[];
  isManager: boolean;
  userRole: ProjectRoleKey;
  loading: boolean;
  onRefetch: () => void;
  /** When true, all write paths (Add/Edit/Delete) are gated with the read-only toast. */
  isReadOnly?: boolean;
}

export const ProjectTransactionsTab = ({
  projectId,
  projectName,
  expenses,
  milestones,
  isManager,
  userRole,
  loading,
  onRefetch,
  isReadOnly = false,
}: ProjectTransactionsTabProps) => {
  const { t, i18n } = useTranslation();
  const reportOwner = useReportOwner();
  const [confidentiality, setConfidentiality] = useConfidentialityLevel();
  const { formatAmount, currency } = useCurrency();
  const { user } = useAuth();
  const { customCategories } = useCustomCategories();
  const { activeBusinessProfileId } = useAppState();
  const { customPaymentSources } = useCustomPaymentSources({ includePersonal: true });
  const { updateBalance, handleTransactionUpdate } = useBalanceUpdater({ onBalanceUpdated: onRefetch });
  // Reuse canonical soft-delete path (Trash + RPC + balance reverse + owner-loan cleanup).
  const { deleteExpense } = useExpenses();
  const { guard, blockProps } = useProjectWriteGuard({ isReadOnly });
  const roTitle = isReadOnly ? blockProps.title : undefined;
  const {
    pendingTransactions,
    approveTransaction,
    rejectTransaction,
    refetch: refetchPending,
    pendingCount,
  } = useProjectPendingTransactions(projectId);

  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [paymentSourceNames, setPaymentSourceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchProfiles = async () => {
      const userIds = [...new Set(expenses.map((e) => e.submitted_by || e.user_id))];
      if (userIds.length === 0) return;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);
      if (data) {
        const profileMap: Record<string, string> = {};
        data.forEach((p) => {
          profileMap[p.user_id] = p.display_name || 'Član';
        });
        setProfiles(profileMap);
      }
    };
    fetchProfiles();
  }, [expenses]);

  useEffect(() => {
    const fetchSourceNames = async () => {
      const sourceIds = [
        ...new Set(
          expenses
            .map((e) => e.payment_source)
            .filter(Boolean)
            .map((s) => s!.replace('custom:', ''))
            .filter((id) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
            ),
        ),
      ];
      if (sourceIds.length === 0) return;
      const { data } = await supabase
        .from('custom_payment_sources')
        .select('id, name, icon')
        .in('id', sourceIds);
      if (data) {
        const nameMap: Record<string, string> = {};
        data.forEach((s) => {
          nameMap[s.id] = `${s.icon} ${s.name}`;
          nameMap[`custom:${s.id}`] = `${s.icon} ${s.name}`;
        });
        setPaymentSourceNames(nameMap);
      }
    };
    fetchSourceNames();
  }, [expenses]);

  const getPaymentSourceLabel = (source: string): string => paymentSourceNames[source] || source;

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterMilestoneId, setFilterMilestoneId] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [filterPaymentSource, setFilterPaymentSource] = useState<string>('all');
  const [filterExpenseNature, setFilterExpenseNature] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterWorkType, setFilterWorkType] = useState<string>('all');

  const dateLocale = i18n?.language === 'de' ? de : i18n?.language === 'en' ? enUS : hr;

  const [selectedExpense, setSelectedExpense] = useState<ProjectExpense | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ProjectExpense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<Category>('other');
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editMilestoneId, setEditMilestoneId] = useState<string>('none');
  const [editType, setEditType] = useState<TransactionType>('expense');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [transactionToReject, setTransactionToReject] = useState<string | null>(null);

  const [expenseType, setExpenseType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [date, setDate] = useState<Date>(new Date());
  const [milestoneId, setMilestoneId] = useState<string>('none');
  const [paymentSourceValue, setPaymentSourceValue] = useState<string>('none');
  const [editPaymentSourceValue, setEditPaymentSourceValue] = useState<string>('none');
  const [expenseNature, setExpenseNature] = useState<'regular' | 'extraordinary'>('regular');

  const [isAdvance, setIsAdvance] = useState(false);
  const [collaboratorId, setCollaboratorId] = useState<string | null>(null);
  const [linkedAdvanceIds, setLinkedAdvanceIds] = useState<string[]>([]);

  const [editIsAdvance, setEditIsAdvance] = useState(false);
  const [editCollaboratorId, setEditCollaboratorId] = useState<string | null>(null);
  const [editLinkedAdvanceIds, setEditLinkedAdvanceIds] = useState<string[]>([]);

  const [filterDateOpen, setFilterDateOpen] = useState(false);
  const [addDateOpen, setAddDateOpen] = useState(false);
  const [editDateOpen, setEditDateOpen] = useState(false);

  const addDateRangeLimits = useMemo(
    () => getDateRange('transactionDynamic', expenseType as 'expense' | 'income'),
    [expenseType],
  );
  const editDateRangeLimits = useMemo(
    () => getDateRange('transactionDynamic', editType as 'expense' | 'income'),
    [editType],
  );
  const reportDateLimits = useMemo(() => getDateRange('report'), []);

  // F8–F10: viewer is strictly read-only (no pending either); worker manages only own work.
  // Approved write: manager (incl. owner) or regular member.
  const canAddTransaction = isManager || userRole === 'member';
  const needsApproval = false;

  const resetForm = () => {
    setExpenseType('expense');
    setAmount('');
    setDescription('');
    setCategory('other');
    setDate(new Date());
    setMilestoneId('none');
    setPaymentSourceValue('none');
    setExpenseNature('regular');
    setIsAdvance(false);
    setCollaboratorId(null);
    setLinkedAdvanceIds([]);
  };

  const handleAddExpense = async () => {
    if (!amount || !description.trim() || !user) return;
    if (!guard()) return;
    setSaving(true);
    try {
      const status = needsApproval ? 'pending' : 'approved';
      const paymentSourceForInsert = paymentSourceValue !== 'none' ? paymentSourceValue : null;
      const parsedAmount = parseFloat(amount);

      const { data: inserted, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          project_id: projectId,
          milestone_id: milestoneId !== 'none' ? milestoneId : null,
          business_profile_id: activeBusinessProfileId || null,
          payment_source: paymentSourceForInsert,
          amount: parsedAmount,
          description: description.trim(),
          category,
          type: expenseType,
          date: date.toISOString(),
          status,
          submitted_by: needsApproval ? user.id : null,
          expense_nature: expenseNature,
          is_advance: expenseType === 'expense' ? isAdvance : false,
          collaborator_id: expenseType === 'expense' ? collaboratorId : null,
          linked_advance_ids: expenseType === 'expense' && !isAdvance ? linkedAdvanceIds : [],
        } as any)
        .select()
        .single();

      if (error) throw error;

      if (status === 'approved' && paymentSourceForInsert) {
        await updateBalance(paymentSourceForInsert, parsedAmount, expenseType);
      }

      if (inserted && status === 'approved') {
        invokeNotifyFunction({
          functionName: 'notify-project-transaction',
          body: { expense_id: (inserted as any).id, project_id: projectId, action: 'created' },
        });
      }

      if (activeBusinessProfileId && inserted && status === 'approved' && expenseType === 'expense') {
        const { createOwnerLoanIfCrossMode } = await import('@/lib/ownerLoanLogic');
        createOwnerLoanIfCrossMode({
          expenseId: (inserted as any).id,
          userId: user.id,
          businessProfileId: activeBusinessProfileId,
          paymentSource: paymentSourceForInsert,
          amount: parsedAmount,
          description: description.trim(),
        }).catch((e) => console.error('Owner-loan creation failed:', e));
      }

      if (needsApproval) {
        showSuccess(t('projects.expenseSubmitted', 'Transakcija poslana na odobrenje'));
      } else {
        showSuccess(t('projects.expenseAdded', 'Trošak dodan'));
      }
      setAddDialogOpen(false);
      resetForm();
      onRefetch();
      if (needsApproval) refetchPending();
    } catch (error) {
      console.error('Error adding expense:', error);
      showError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (transactionId: string) => {
    await approveTransaction(transactionId);
    onRefetch();
  };

  const handleReject = (transactionId: string) => {
    setTransactionToReject(transactionId);
    setRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (transactionToReject) {
      await rejectTransaction(transactionToReject);
      setRejectDialogOpen(false);
      setTransactionToReject(null);
    }
  };

  const handleDeleteExpense = (expenseId: string) => {
    if (!guard()) return;
    setExpenseToDelete(expenseId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      // Use canonical deleteExpense path:
      // - soft delete via RPC (goes to Trash with 30d retention)
      // - reverses balance for custom: payment sources
      // - cleans up linked owner-loan (cross-mode)
      // silent=true to keep the existing project-tab toast wording.
      await deleteExpense(expenseToDelete, { silent: true });
      showSuccess(t('common.deleted'));
      onRefetch();
    } catch (error) {
      console.error('Error deleting expense:', error);
      showError(t('common.error'));
    } finally {
      setDeleteDialogOpen(false);
      setExpenseToDelete(null);
    }

  };

  const handleOpenEdit = (expense: ProjectExpense) => {
    if (!guard()) return;
    setEditingExpense(expense);
    setEditType(expense.type as TransactionType);
    setEditAmount(expense.amount.toString());
    setEditDescription(expense.description);
    setEditCategory(expense.category as Category);
    setEditDate(new Date(expense.date));
    setEditMilestoneId(expense.milestone_id || 'none');
    setEditPaymentSourceValue(expense.payment_source || 'none');
    setEditIsAdvance(!!expense.is_advance);
    setEditCollaboratorId(expense.collaborator_id || null);
    setEditLinkedAdvanceIds(Array.isArray(expense.linked_advance_ids) ? expense.linked_advance_ids : []);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingExpense || !editAmount || !editDescription.trim()) return;
    if (!guard()) return;
    setSaving(true);
    try {
      const newPaymentSource = editPaymentSourceValue !== 'none' ? editPaymentSourceValue : null;
      const newAmount = parseFloat(editAmount);
      const oldPaymentSource = editingExpense.payment_source || undefined;
      const oldAmount = editingExpense.amount;
      const oldType = editingExpense.type as TransactionType;

      const { error } = await supabase
        .from('expenses')
        .update({
          type: editType,
          amount: newAmount,
          description: editDescription.trim(),
          category: editCategory,
          date: editDate.toISOString(),
          milestone_id: editMilestoneId !== 'none' ? editMilestoneId : null,
          business_profile_id: activeBusinessProfileId || null,
          payment_source: newPaymentSource,
          is_advance: editType === 'expense' ? editIsAdvance : false,
          collaborator_id: editType === 'expense' ? editCollaboratorId : null,
          linked_advance_ids: editType === 'expense' && !editIsAdvance ? editLinkedAdvanceIds : [],
        } as any)
        .eq('id', editingExpense.id);

      if (error) throw error;

      await handleTransactionUpdate(
        oldPaymentSource,
        oldAmount,
        oldType,
        newPaymentSource || undefined,
        newAmount,
        editType,
      );

      const significantChange =
        oldAmount !== newAmount ||
        oldType !== editType ||
        editingExpense.description !== editDescription.trim() ||
        editingExpense.category !== editCategory ||
        (editingExpense.milestone_id || null) !== (editMilestoneId !== 'none' ? editMilestoneId : null);
      if (significantChange) {
        invokeNotifyFunction({
          functionName: 'notify-project-transaction',
          body: { expense_id: editingExpense.id, project_id: projectId, action: 'updated' },
        });
      }

      if (activeBusinessProfileId && editType === 'expense' && user) {
        const { syncOwnerLoanForExpense } = await import('@/lib/ownerLoanLogic');
        syncOwnerLoanForExpense({
          expenseId: editingExpense.id,
          userId: user.id,
          businessProfileId: activeBusinessProfileId,
          paymentSource: newPaymentSource,
          amount: newAmount,
          description: editDescription.trim(),
        }).catch((e) => console.error('Owner-loan sync failed:', e));
      }

      showSuccess(t('common.saved', 'Spremljeno'));
      setEditDialogOpen(false);
      setEditingExpense(null);
      onRefetch();
    } catch (error) {
      console.error('Error updating expense:', error);
      showError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const getMilestoneName = (mId: string | null | undefined) => {
    if (!mId) return null;
    return milestones.find((m) => m.id === mId)?.name || null;
  };

  const filterState = {
    searchTerm,
    filterMilestoneId,
    filterDateRange,
    filterPaymentSource,
    filterExpenseNature,
    filterCategory,
    filterWorkType,
  };

  const filteredExpenses = useMemo(
    () => filterProjectExpenses(expenses, filterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      expenses,
      searchTerm,
      filterMilestoneId,
      filterDateRange,
      filterPaymentSource,
      filterExpenseNature,
      filterCategory,
      filterWorkType,
    ],
  );

  const filteredTotals = useMemo(() => computeProjectExpenseTotals(filteredExpenses), [filteredExpenses]);
  const hasActiveFilters = hasActiveProjectFilters(filterState);

  const handlePrintFiltered = async () => {
    await ensureReportLogo();
    const rowsHtml = filteredExpenses
      .map((e) => {
        const cat = resolveCategory(e.category, customCategories);
        const milestone = getMilestoneName(e.milestone_id);
        const cls = e.type === 'income' ? 'pos' : 'neg';
        return `<tr>
        <td>${format(new Date(e.date), 'dd.MM.yyyy')}</td>
        <td>${e.description}</td>
        <td>${cat.name}</td>
        <td>${milestone || '-'}</td>
        <td>${e.expense_nature === 'extraordinary' ? t('projects.extraordinary', 'Vanredni') : t('projects.regular', 'Redovni')}</td>
        <td class="num ${cls}">${e.type === 'income' ? '+' : '-'}${formatAmount(e.amount)}</td>
      </tr>`;
      })
      .join('');

    const net = filteredTotals.net;
    const kpiStrip = renderHtmlKpiStrip([
      { label: t('common.balance', 'Razlika'), value: formatAmount(net), hero: true },
      { label: t('transactions.income', 'Prihodi'), value: formatAmount(filteredTotals.totalIncome), tone: 'pos' },
      { label: t('transactions.expense', 'Troškovi'), value: formatAmount(filteredTotals.totalExpenses), tone: 'neg' },
      { label: t('common.count', 'Broj'), value: String(filteredExpenses.length) },
    ]);

    const bodyHtml = `${kpiStrip}
      <h2>${hasActiveFilters ? t('projects.filteredTransactions', 'Filtrirane transakcije') : t('projects.allTransactions', 'Sve transakcije')}</h2>
      <table>
        <thead><tr>
          <th>${t('common.date', 'Datum')}</th>
          <th>${t('common.description', 'Opis')}</th>
          <th>${t('common.category', 'Kategorija')}</th>
          <th>${t('projects.milestone', 'Faza')}</th>
          <th>${t('projects.expenseNature', 'Vrsta')}</th>
          <th class="num">${t('common.amount', 'Iznos')}</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

    const html = buildReportHtml({
      title: projectName || t('projects.project', 'Projekt'),
      brand: {
        owner: reportOwner,
        language: (i18n.language as any) || 'hr',
        confidentiality,
        subtitle: hasActiveFilters ? t('projects.filteredTransactions', 'Filtrirane transakcije') : t('projects.allTransactions', 'Sve transakcije'),
      },
      bodyHtml,
      confidentialityLabel: {
        internal: t('reportBranding.confidentiality.internal'),
        confidential: t('reportBranding.confidentiality.confidential'),
      },
      intendedForLabel:
        confidentiality !== 'none' && reportOwner ? `${t('reportBranding.intendedFor')}: ${reportOwner}` : undefined,
    });

    if (Capacitor.isNativePlatform()) {
      const fileName = buildReportFileName({ type: 'projekt', owner: reportOwner, period: projectName || undefined, ext: 'html' });
      exportTextFile(html, fileName, 'text/html', false, 'save');
      return;
    }
    printHtmlDocument(html);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isManager && pendingCount > 0 && (
        <PendingApprovalsStrip
          pendingTransactions={pendingTransactions}
          pendingCount={pendingCount}
          customCategories={customCategories}
          formatAmount={formatAmount}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      {canAddTransaction && (
        <div className="flex justify-between items-center">
          {needsApproval && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              {t('projects.viewerNote', 'Vaše transakcije zahtijevaju odobrenje člana')}
            </div>
          )}
          <Button
            onClick={() => { if (!guard()) return; setAddDialogOpen(true); }}
            size="sm"
            className={needsApproval ? '' : 'ml-auto'}
            disabled={isReadOnly}
            aria-disabled={isReadOnly}
            title={roTitle}
          >
            <Plus className="w-4 h-4 mr-2" />
            {needsApproval
              ? t('projects.submitExpense', 'Predloži trošak')
              : t('projects.addExpense', 'Dodaj trošak')}
          </Button>
        </div>
      )}

      {expenses.length > 0 && (
        <ProjectTransactionsFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          showFilters={showFilters}
          onShowFiltersChange={setShowFilters}
          filterMilestoneId={filterMilestoneId}
          onFilterMilestoneIdChange={setFilterMilestoneId}
          filterDateRange={filterDateRange}
          onFilterDateRangeChange={setFilterDateRange}
          filterPaymentSource={filterPaymentSource}
          onFilterPaymentSourceChange={setFilterPaymentSource}
          filterExpenseNature={filterExpenseNature}
          onFilterExpenseNatureChange={setFilterExpenseNature}
          filterCategory={filterCategory}
          onFilterCategoryChange={setFilterCategory}
          filterWorkType={filterWorkType}
          onFilterWorkTypeChange={setFilterWorkType}
          filterDateOpen={filterDateOpen}
          onFilterDateOpenChange={setFilterDateOpen}
          expenses={expenses}
          milestones={milestones}
          customCategories={customCategories}
          getPaymentSourceLabel={getPaymentSourceLabel}
          dateLocale={dateLocale}
          reportDateLimits={reportDateLimits}
          onClearAll={() => {
            setSearchTerm('');
            setFilterMilestoneId('all');
            setFilterDateRange(undefined);
            setFilterPaymentSource('all');
            setFilterExpenseNature('all');
          }}
        />
      )}

      <ProjectTransactionsList
        expenses={expenses}
        filteredExpenses={filteredExpenses}
        totals={filteredTotals}
        profiles={profiles}
        milestones={milestones}
        customCategories={customCategories}
        formatAmount={formatAmount}
        userId={user?.id}
        hasActiveFilters={hasActiveFilters}
        confidentiality={confidentiality}
        setConfidentiality={setConfidentiality}
        onOpenDetail={(expense) => {
          setSelectedExpense(expense);
          setDetailDialogOpen(true);
        }}
        onPrint={handlePrintFiltered}
      />

      <ProjectTransactionAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        projectId={projectId}
        saving={saving}
        expenseType={expenseType}
        setExpenseType={setExpenseType}
        amount={amount}
        setAmount={setAmount}
        description={description}
        setDescription={setDescription}
        category={category}
        setCategory={setCategory}
        date={date}
        setDate={setDate}
        milestoneId={milestoneId}
        setMilestoneId={setMilestoneId}
        paymentSourceValue={paymentSourceValue}
        setPaymentSourceValue={setPaymentSourceValue}
        expenseNature={expenseNature}
        setExpenseNature={setExpenseNature}
        isAdvance={isAdvance}
        setIsAdvance={setIsAdvance}
        collaboratorId={collaboratorId}
        setCollaboratorId={setCollaboratorId}
        linkedAdvanceIds={linkedAdvanceIds}
        setLinkedAdvanceIds={setLinkedAdvanceIds}
        addDateOpen={addDateOpen}
        setAddDateOpen={setAddDateOpen}
        milestones={milestones}
        customPaymentSources={customPaymentSources}
        currencySymbol={currency.symbol}
        formatAmount={formatAmount}
        addDateRangeLimits={addDateRangeLimits}
        onCancel={() => {
          setAddDialogOpen(false);
          resetForm();
        }}
        onSubmit={handleAddExpense}
      />

      <ProjectTransactionDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        expense={selectedExpense}
        customCategories={customCategories}
        milestones={milestones}
        formatAmount={formatAmount}
        projectId={projectId}
        isManager={isManager}
        userId={user?.id}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteExpense}
        onNoteAdded={onRefetch}
      />

      <ProjectTransactionEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        projectId={projectId}
        editingExpense={editingExpense}
        saving={saving}
        editType={editType}
        setEditType={setEditType}
        editAmount={editAmount}
        setEditAmount={setEditAmount}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editDate={editDate}
        setEditDate={setEditDate}
        editMilestoneId={editMilestoneId}
        setEditMilestoneId={setEditMilestoneId}
        editPaymentSourceValue={editPaymentSourceValue}
        setEditPaymentSourceValue={setEditPaymentSourceValue}
        editIsAdvance={editIsAdvance}
        setEditIsAdvance={setEditIsAdvance}
        editCollaboratorId={editCollaboratorId}
        setEditCollaboratorId={setEditCollaboratorId}
        editLinkedAdvanceIds={editLinkedAdvanceIds}
        setEditLinkedAdvanceIds={setEditLinkedAdvanceIds}
        editDateOpen={editDateOpen}
        setEditDateOpen={setEditDateOpen}
        milestones={milestones}
        customPaymentSources={customPaymentSources}
        currencySymbol={currency.symbol}
        editDateRangeLimits={editDateRangeLimits}
        onCancel={() => setEditDialogOpen(false)}
        onSubmit={handleSaveEdit}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.deleteTitle', 'Obriši transakciju')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.confirmDelete', 'Jeste li sigurni da želite obrisati ovu transakciju?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.rejectTitle', 'Odbij transakciju')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects.confirmRejectTransaction', 'Jeste li sigurni da želite odbiti ovu transakciju?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
