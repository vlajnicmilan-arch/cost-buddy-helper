import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { supabase } from '@/integrations/supabase/client';

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'HRK' | 'PLN' | 'CZK' | 'HUF' | 'RSD' | 'BAM' | 'PEN';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'hr-HR' },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  { code: 'HRK', symbol: 'kn', name: 'Hrvatska kuna', locale: 'hr-HR' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', locale: 'cs-CZ' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', locale: 'hu-HU' },
  { code: 'RSD', symbol: 'RSD', name: 'Serbian Dinar', locale: 'sr-RS' },
  { code: 'BAM', symbol: 'KM', name: 'Convertible Mark', locale: 'bs-BA' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', locale: 'es-PE' },
];

const CURRENCY_STORAGE_KEY = 'vm-balance-currency';
const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: CurrencyCode) => Promise<void>;
  formatAmount: (amount: number) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [loading, setLoading] = useState(true);

  const isLocalMode = storageMode === 'local';

  // Load currency preference
  useEffect(() => {
    const loadCurrency = async () => {
      setLoading(true);
      try {
        if (isLocalMode) {
          const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
          if (stored && CURRENCIES.some(c => c.code === stored)) {
            setCurrencyCode(stored as CurrencyCode);
          }
        } else if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('currency')
            .eq('user_id', user.id)
            .single();
          
          if (data?.currency && CURRENCIES.some(c => c.code === data.currency)) {
            setCurrencyCode(data.currency as CurrencyCode);
          }
        }
      } catch (error) {
        console.error('Failed to load currency preference:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCurrency();
  }, [isLocalMode, user]);

  const setCurrency = async (code: CurrencyCode) => {
    setCurrencyCode(code);
    
    try {
      if (isLocalMode) {
        localStorage.setItem(CURRENCY_STORAGE_KEY, code);
      } else if (user) {
        // First check if profile exists
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          await supabase
            .from('profiles')
            .update({ currency: code })
            .eq('user_id', user.id);
        } else {
          await supabase
            .from('profiles')
            .insert({ user_id: user.id, currency: code });
        }
      }
    } catch (error) {
      console.error('Failed to save currency preference:', error);
    }
  };

  const currency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency.code,
    }).format(amount);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatAmount, loading }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
