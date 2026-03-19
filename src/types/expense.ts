export type Category = 
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'bills'
  | 'health'
  | 'groceries'
  | 'utilities'
  | 'rent'
  | 'education'
  | 'travel'
  | 'clothing'
  | 'beauty'
  | 'sports'
  | 'pets'
  | 'gifts'
  | 'subscriptions'
  | 'savings'
  | 'investments'
  | 'charity'
  | 'kids'
  | 'home'
  | 'car'
  | 'insurance'
  | 'taxes'
  | 'other';

export type IncomeCategory = 
  | 'salary'
  | 'freelance'
  | 'gift_income'
  | 'mortgage'
  | 'personal_loan'
  | 'sale'
  | 'other_income';

export interface IncomeCategoryInfo {
  id: IncomeCategory;
  name: string;
  icon: string;
  color: string;
}

export const INCOME_CATEGORIES: IncomeCategoryInfo[] = [
  { id: 'salary', name: 'Plaća', icon: '💰', color: 'category-income' },
  { id: 'freelance', name: 'Honorar', icon: '💼', color: 'category-income' },
  { id: 'gift_income', name: 'Poklon', icon: '🎁', color: 'category-income' },
  { id: 'mortgage', name: 'Stambeni kredit', icon: '🏠', color: 'category-income' },
  { id: 'personal_loan', name: 'Nenamjenski kredit', icon: '💳', color: 'category-income' },
  { id: 'sale', name: 'Prodaja', icon: '🛒', color: 'category-income' },
  { id: 'other_income', name: 'Ostalo', icon: '📦', color: 'category-income' },
];

export const getIncomeCategoryInfo = (category: IncomeCategory): IncomeCategoryInfo => {
  return INCOME_CATEGORIES.find(c => c.id === category) || INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1];
};

export type PaymentSource = 
  | 'cash'
  | 'bank'
  | 'revolut'
  | 'aircash'
  | 'crypto'
  | 'visa'
  | 'visa_gold'
  | 'visa_platinum'
  | 'visa_kekspay'
  | 'visa_erste'
  | 'mastercard'
  | 'mastercard_gold'
  | 'mastercard_platinum'
  | 'maestro'
  | 'amex'
  | 'diners'
  | 'other';

export interface PaymentSourceInfo {
  id: PaymentSource;
  name: string;
  icon: string;
}

export const PAYMENT_SOURCES: PaymentSourceInfo[] = [
  { id: 'cash', name: 'Gotovina', icon: '💵' },
  { id: 'bank', name: 'Banka', icon: '🏦' },
  // Visa kartice
  { id: 'visa', name: 'Visa', icon: '💳' },
  { id: 'visa_gold', name: 'Visa Gold', icon: '💳' },
  { id: 'visa_platinum', name: 'Visa Platinum', icon: '💳' },
  { id: 'visa_kekspay', name: 'Visa KeksPay', icon: '📱' },
  { id: 'visa_erste', name: 'Visa Erstebank', icon: '🏦' },
  // Mastercard kartice
  { id: 'mastercard', name: 'Mastercard', icon: '💳' },
  { id: 'mastercard_gold', name: 'Mastercard Gold', icon: '💳' },
  { id: 'mastercard_platinum', name: 'Mastercard Platinum', icon: '💳' },
  { id: 'maestro', name: 'Maestro', icon: '💳' },
  // Ostale kartice
  { id: 'amex', name: 'American Express', icon: '💳' },
  { id: 'diners', name: 'Diners Club', icon: '💳' },
  // Digitalni novčanici
  { id: 'revolut', name: 'Revolut', icon: '💳' },
  { id: 'aircash', name: 'Aircash', icon: '📱' },
  { id: 'crypto', name: 'Kripto', icon: '₿' },
  { id: 'other', name: 'Ostalo', icon: '💰' },
];

export interface PaymentSourceGroup {
  label: string;
  sources: PaymentSourceInfo[];
}

export const PAYMENT_SOURCE_GROUPS: PaymentSourceGroup[] = [
  {
    label: 'Osnovno',
    sources: [
      { id: 'cash', name: 'Gotovina', icon: '💵' },
      { id: 'bank', name: 'Banka', icon: '🏦' },
    ]
  },
  {
    label: 'Visa',
    sources: [
      { id: 'visa', name: 'Visa', icon: '💳' },
      { id: 'visa_gold', name: 'Visa Gold', icon: '💳' },
      { id: 'visa_platinum', name: 'Visa Platinum', icon: '💳' },
      { id: 'visa_kekspay', name: 'Visa KeksPay', icon: '📱' },
      { id: 'visa_erste', name: 'Visa Erstebank', icon: '🏦' },
    ]
  },
  {
    label: 'Mastercard',
    sources: [
      { id: 'mastercard', name: 'Mastercard', icon: '💳' },
      { id: 'mastercard_gold', name: 'Mastercard Gold', icon: '💳' },
      { id: 'mastercard_platinum', name: 'Mastercard Platinum', icon: '💳' },
      { id: 'maestro', name: 'Maestro', icon: '💳' },
    ]
  },
  {
    label: 'Ostale kartice',
    sources: [
      { id: 'amex', name: 'American Express', icon: '💳' },
      { id: 'diners', name: 'Diners Club', icon: '💳' },
    ]
  },
  {
    label: 'Digitalni novčanici',
    sources: [
      { id: 'revolut', name: 'Revolut', icon: '💳' },
      { id: 'aircash', name: 'Aircash', icon: '📱' },
      { id: 'crypto', name: 'Kripto', icon: '₿' },
    ]
  },
  {
    label: 'Ostalo',
    sources: [
      { id: 'other', name: 'Ostalo', icon: '💰' },
    ]
  }
];

export const getPaymentSourceInfo = (source: PaymentSource): PaymentSourceInfo => {
  return PAYMENT_SOURCES.find(s => s.id === source) || PAYMENT_SOURCES[PAYMENT_SOURCES.length - 1];
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

export type TransactionStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: Category | IncomeCategory;
  date: Date;
  type: TransactionType;
  payment_source?: PaymentSource;
  payment_source_card_id?: string | null;
  receipt_url?: string | null;
  merchant_name?: string | null;
  ai_extracted?: boolean | null;
  income_source_id?: string | null;
  project_id?: string | null;
  budget_id?: string | null;
  milestone_id?: string | null;
  status?: TransactionStatus | null;
  submitted_by?: string | null;
  note?: string | null;
  expense_nature?: 'regular' | 'extraordinary' | null;
  business_profile_id?: string | null;
  cash_register_id?: string | null;
  currency?: string | null;
  created_at?: string;
  updated_at?: string;
  import_batch_id?: string | null;
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
  { id: 'groceries', name: 'Namirnice', icon: '🛒', color: 'category-food' },
  { id: 'transport', name: 'Prijevoz', icon: '🚗', color: 'category-transport' },
  { id: 'car', name: 'Automobil', icon: '🚘', color: 'category-transport' },
  { id: 'shopping', name: 'Kupovina', icon: '🛍️', color: 'category-shopping' },
  { id: 'clothing', name: 'Odjeća', icon: '👕', color: 'category-shopping' },
  { id: 'entertainment', name: 'Zabava', icon: '🎬', color: 'category-entertainment' },
  { id: 'subscriptions', name: 'Pretplate', icon: '📺', color: 'category-entertainment' },
  { id: 'bills', name: 'Računi', icon: '📄', color: 'category-bills' },
  { id: 'utilities', name: 'Režije', icon: '💡', color: 'category-bills' },
  { id: 'rent', name: 'Najam', icon: '🏠', color: 'category-bills' },
  { id: 'health', name: 'Zdravlje', icon: '💊', color: 'category-health' },
  { id: 'beauty', name: 'Ljepota', icon: '💅', color: 'category-health' },
  { id: 'sports', name: 'Sport', icon: '⚽', color: 'category-health' },
  { id: 'education', name: 'Obrazovanje', icon: '📚', color: 'category-other' },
  { id: 'travel', name: 'Putovanja', icon: '✈️', color: 'category-entertainment' },
  { id: 'home', name: 'Dom', icon: '🏡', color: 'category-bills' },
  { id: 'pets', name: 'Ljubimci', icon: '🐕', color: 'category-other' },
  { id: 'gifts', name: 'Pokloni', icon: '🎁', color: 'category-shopping' },
  { id: 'kids', name: 'Djeca', icon: '👶', color: 'category-other' },
  { id: 'insurance', name: 'Osiguranje', icon: '🛡️', color: 'category-bills' },
  { id: 'taxes', name: 'Porezi', icon: '🏛️', color: 'category-bills' },
  { id: 'savings', name: 'Štednja', icon: '🐷', color: 'category-other' },
  { id: 'investments', name: 'Investicije', icon: '📈', color: 'category-other' },
  { id: 'charity', name: 'Donacije', icon: '❤️', color: 'category-other' },
  { id: 'other', name: 'Ostalo', icon: '📦', color: 'category-other' },
];

export const getCategoryInfo = (category: Category | IncomeCategory): CategoryInfo | IncomeCategoryInfo => {
  // First check if it's an income category
  const incomeCategory = INCOME_CATEGORIES.find(c => c.id === category);
  if (incomeCategory) {
    return incomeCategory;
  }
  // Otherwise return expense category
  return CATEGORIES.find(c => c.id === category) || CATEGORIES[CATEGORIES.length - 1];
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
