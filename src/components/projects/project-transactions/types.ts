export interface ProjectExpense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: string;
  milestone_id?: string | null;
  status?: string | null;
  submitted_by?: string | null;
  expense_nature?: string | null;
  payment_source?: string | null;
  work_type?: 'material' | 'labor' | 'equipment' | 'other' | null;
  is_advance?: boolean | null;
  collaborator_id?: string | null;
  linked_advance_ids?: string[] | null;
}

export interface ProjectTransactionFilterState {
  searchTerm: string;
  filterMilestoneId: string; // 'all' | 'none' | <id>
  filterDateRange: { from?: Date; to?: Date } | undefined;
  filterPaymentSource: string; // 'all' | <value>
  filterExpenseNature: string; // 'all' | 'regular' | 'extraordinary'
  filterCategory: string; // 'all' | <id>
  filterWorkType: string; // 'all' | 'material' | 'labor' | 'equipment' | 'other'
}
