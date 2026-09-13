import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PaymentSourceName {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

/**
 * IMENA SVIH KORISNIKOVIH NOVČANIKA, bez obzira na aktivni doseg.
 *
 * Služi ISKLJUČIVO za prikaz imena na transakciji: trošak premješten između
 * osobnog i poslovnog pregleda i dalje je plaćen iz novčanika druge strane,
 * pa bi scope-filtrirani popis prikazao "nepoznat izvor". Saldo i odabir
 * novčanika i dalje idu kroz `useCustomPaymentSources` (scope se ne mijenja).
 */
export const useAllPaymentSourceNames = (): PaymentSourceName[] => {
  const { user, authReady } = useAuth();
  const [names, setNames] = useState<PaymentSourceName[]>([]);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('custom_payment_sources' as any)
        .select('id, name, icon, color')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.error('Error loading payment source names:', error);
        return;
      }
      setNames((data as unknown as PaymentSourceName[]) || []);
    };
    void load();
    return () => { cancelled = true; };
  }, [authReady, user]);

  return names;
};
