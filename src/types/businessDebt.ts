export type DebtType = 'receivable' | 'payable';
export type DebtStatus = 'active' | 'paid' | 'overdue' | 'cancelled';

export interface BusinessDebt {
  id: string;
  business_profile_id: string;
  user_id: string;
  type: DebtType;
  contact_name: string;
  description?: string | null;
  amount: number;
  paid_amount: number;
  due_date?: string | null;
  status: DebtStatus;
  created_at?: string;
  updated_at?: string;
}
