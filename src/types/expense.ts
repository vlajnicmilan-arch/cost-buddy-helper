export type Category = 
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'bills'
  | 'health'
  | 'other';

export type PaymentSource = 
  | 'cash'
  | 'bank'
  | 'revolut'
  | 'aircash'
  | 'crypto'
  | 'other';

export interface PaymentSourceInfo {
  id: PaymentSource;
  name: string;
  icon: string;
}

export const PAYMENT_SOURCES: PaymentSourceInfo[] = [
  { id: 'cash', name: 'Gotovina', icon: '💵' },
  { id: 'bank', name: 'Banka', icon: '🏦' },
  { id: 'revolut', name: 'Revolut', icon: '💳' },
  { id: 'aircash', name: 'Aircash', icon: '📱' },
  { id: 'crypto', name: 'Kripto', icon: '₿' },
  { id: 'other', name: 'Ostalo', icon: '💰' },
];

export const getPaymentSourceInfo = (source: PaymentSource): PaymentSourceInfo => {
  return PAYMENT_SOURCES.find(s => s.id === source) || PAYMENT_SOURCES[5];
};

export interface ReceiptItem {
  id?: string;
  expense_id?: string;
  name: string;
  quantity: number;
  unit_price?: number;
  total_price: number;
  created_at?: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: Category;
  date: Date;
  type: TransactionType;
  payment_source?: PaymentSource;
  receipt_url?: string | null;
  merchant_name?: string | null;
  ai_extracted?: boolean | null;
  income_source_id?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: ReceiptItem[];
}

// Helper to get transaction type display info
export const getTransactionTypeInfo = (type: TransactionType): { name: string; icon: string } => {
  switch (type) {
    case 'income': return { name: 'Prihod', icon: '📥' };
    case 'expense': return { name: 'Trošak', icon: '📤' };
    case 'transfer': return { name: 'Prijenos', icon: '🔄' };
    default: return { name: 'Ostalo', icon: '📦' };
  }
};

export interface CategoryInfo {
  id: Category;
  name: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'food', name: 'Hrana', icon: '🍔', color: 'category-food' },
  { id: 'transport', name: 'Prijevoz', icon: '🚗', color: 'category-transport' },
  { id: 'shopping', name: 'Kupovina', icon: '🛍️', color: 'category-shopping' },
  { id: 'entertainment', name: 'Zabava', icon: '🎬', color: 'category-entertainment' },
  { id: 'bills', name: 'Računi', icon: '📄', color: 'category-bills' },
  { id: 'health', name: 'Zdravlje', icon: '💊', color: 'category-health' },
  { id: 'other', name: 'Ostalo', icon: '📦', color: 'category-other' },
];

export const getCategoryInfo = (category: Category): CategoryInfo => {
  return CATEGORIES.find(c => c.id === category) || CATEGORIES[6];
};

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  bank_name: string;
  account_id?: string;
  status: 'pending' | 'connected' | 'error' | 'expired';
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}
