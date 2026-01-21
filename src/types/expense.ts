export type Category = 
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'bills'
  | 'health'
  | 'other';

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: Category;
  date: Date;
  type: 'expense' | 'income';
  receipt_url?: string | null;
  merchant_name?: string | null;
  ai_extracted?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

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
