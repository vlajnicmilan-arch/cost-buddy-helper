export interface InstallmentPlan {
  id: string;
  user_id: string;
  description: string;
  total_amount: number;
  installment_count: number;
  first_payment_date: Date;
  category: string;
  payment_source?: string;
  payment_source_card_id?: string | null;
  type: 'expense' | 'income';
  created_at?: string;
  updated_at?: string;
  installments?: Installment[];
}

export interface Installment {
  id: string;
  plan_id: string;
  user_id: string;
  installment_number: number;
  amount: number;
  due_date: Date;
  status: 'planned' | 'paid';
  paid_at?: string | null;
  expense_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InstallmentPlanWithProgress extends InstallmentPlan {
  paidCount: number;
  totalCount: number;
  paidAmount: number;
  remainingAmount: number;
  nextInstallment?: Installment;
}
