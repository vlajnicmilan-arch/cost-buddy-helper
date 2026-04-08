import { Expense } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { TransactionListDialog } from '@/components/TransactionListDialog';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { EditTransactionDialog } from '@/components/EditTransactionDialog';
import { TransferListDialog } from '@/components/TransferListDialog';
import { PaymentSourceTransactionsDialog } from '@/components/PaymentSourceTransactionsDialog';
import { RecurringTransactionsPanel } from '@/components/recurring/RecurringTransactionsPanel';
import { RecurringMatchDialog } from '@/components/recurring/RecurringMatchDialog';
import { RecurringMatch } from '@/hooks/useRecurringMatcher';
import { ParsedTransaction } from '@/lib/csvParsers';

interface SharedDialogsProps {
  // Income/Expense list dialogs
  incomeDialogOpen: boolean;
  onIncomeDialogChange: (open: boolean) => void;
  expenseDialogOpen: boolean;
  onExpenseDialogChange: (open: boolean) => void;
  expenses: Expense[];
  totalIncome: number;
  totalExpenses: number;
  onUpdateExpense: (expense: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  // Transfer dialog
  transferDialogOpen: boolean;
  onTransferDialogChange: (open: boolean) => void;
  allTransfers: Expense[];
  totalTransfers: number;
  // Detail dialog
  selectedTransaction: Expense | null;
  detailDialogOpen: boolean;
  onDetailDialogChange: (open: boolean) => void;
  onEditFromDetail: (expense: Expense) => void;
  // Edit dialog
  editDialogOpen: boolean;
  onEditDialogChange: (open: boolean) => void;
  // Payment source dialog
  paymentSourceDialogOpen: boolean;
  onPaymentSourceDialogChange: (open: boolean) => void;
  selectedPaymentSource: CustomPaymentSource | null;
  allExpenses: Expense[];
  onImportCSV: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates: any;
  // Recurring
  recurringPanelOpen: boolean;
  onRecurringPanelClose: () => void;
  recurringMatchDialogOpen: boolean;
  onRecurringMatchDialogChange: (open: boolean) => void;
  recurringMatches: RecurringMatch[];
  onRecurringMatchConfirm: (selectedIds: string[]) => Promise<void>;
}

export const SharedDialogs = ({
  incomeDialogOpen,
  onIncomeDialogChange,
  expenseDialogOpen,
  onExpenseDialogChange,
  expenses,
  totalIncome,
  totalExpenses,
  onUpdateExpense,
  onDeleteExpense,
  transferDialogOpen,
  onTransferDialogChange,
  allTransfers,
  totalTransfers,
  selectedTransaction,
  detailDialogOpen,
  onDetailDialogChange,
  onEditFromDetail,
  editDialogOpen,
  onEditDialogChange,
  paymentSourceDialogOpen,
  onPaymentSourceDialogChange,
  selectedPaymentSource,
  allExpenses,
  onImportCSV,
  findDuplicates,
  recurringPanelOpen,
  onRecurringPanelClose,
  recurringMatchDialogOpen,
  onRecurringMatchDialogChange,
  recurringMatches,
  onRecurringMatchConfirm,
}: SharedDialogsProps) => {
  return (
    <>
      <TransactionListDialog
        open={incomeDialogOpen}
        onOpenChange={onIncomeDialogChange}
        type="income"
        expenses={expenses}
        onUpdate={onUpdateExpense}
        onDelete={onDeleteExpense}
        total={totalIncome}
      />
      <TransactionListDialog
        open={expenseDialogOpen}
        onOpenChange={onExpenseDialogChange}
        type="expense"
        expenses={expenses}
        onUpdate={onUpdateExpense}
        onDelete={onDeleteExpense}
        total={totalExpenses}
      />
      <TransferListDialog
        open={transferDialogOpen}
        onOpenChange={onTransferDialogChange}
        transfers={allTransfers}
        totalAmount={totalTransfers}
      />
      <TransactionDetailDialog
        expense={selectedTransaction}
        open={detailDialogOpen}
        onOpenChange={onDetailDialogChange}
        onEdit={onEditFromDetail}
        onDelete={onDeleteExpense}
      />
      <EditTransactionDialog
        expense={selectedTransaction}
        open={editDialogOpen}
        onOpenChange={onEditDialogChange}
        onSave={onUpdateExpense}
      />
      <PaymentSourceTransactionsDialog
        open={paymentSourceDialogOpen}
        onOpenChange={onPaymentSourceDialogChange}
        paymentSource={selectedPaymentSource}
        expenses={allExpenses}
        onUpdate={onUpdateExpense}
        onDelete={onDeleteExpense}
        onImportCSV={onImportCSV}
        findDuplicates={findDuplicates}
      />

      {recurringPanelOpen && (
        <RecurringTransactionsPanel onClose={onRecurringPanelClose} />
      )}

      <RecurringMatchDialog
        open={recurringMatchDialogOpen}
        onOpenChange={onRecurringMatchDialogChange}
        matches={recurringMatches}
        onConfirm={onRecurringMatchConfirm}
      />
    </>
  );
};
