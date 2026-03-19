import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const CACHE_KEY = 'exchange_rates_cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface CachedRates {
  rates: Record<string, number>;
  timestamp: number;
}

export const useExchangeRates = (enabled: boolean) => {
  const [rates, setRates] = useState<Record<string, number>>({ EUR: 1 });
  const [loading, setLoading] = useState(false);

  const fetchRates = useCallback(async () => {
    if (!enabled) return;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedRates = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          setRates(parsed.rates);
          return;
        }
      }
    } catch {}

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('exchange-rates');
      if (error) throw error;
      
      if (data?.rates) {
        setRates(data.rates);
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          rates: data.rates,
          timestamp: Date.now(),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
      // Use fallback rates
      setRates({
        EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.97, HRK: 7.5345,
        PLN: 4.32, CZK: 25.3, HUF: 395, RSD: 117.2, BAM: 1.95583, PEN: 4.05
      });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  /**
   * Convert an amount from one currency to another using mid-rates.
   * All rates are relative to EUR as the base.
   */
  const convert = useCallback((amount: number, fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return amount;
    
    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;
    
    // Convert: amount in FROM → EUR → TO
    const amountInEur = amount / fromRate;
    return amountInEur * toRate;
  }, [rates]);

  return { rates, loading, convert, refetch: fetchRates };
};
