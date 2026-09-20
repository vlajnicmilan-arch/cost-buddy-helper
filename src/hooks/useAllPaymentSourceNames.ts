import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PaymentSourceName {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

/**
 * IMENA SVIH KORISNIKOVIH NOVČANIKA, bez obzira na aktivni doseg.
 *
 * Služi ISKLJUČIVO za prikaz imena na transakciji: trošak s firminog novčanika
 * viđen u drugom pogledu i dalje mora pokazati pravo ime novčanika, nikad
 * „Ostalo". Saldo i odabir novčanika i dalje idu kroz `useCustomPaymentSources`
 * (scope se ne mijenja).
 *
 * Dohvat je dijeljen (modul-level cache) jer ga zovu i pojedinačni retci
 * popisa — inače bi svaki redak slao vlastiti upit.
 */
const cache = new Map<string, PaymentSourceName[]>();
const inflight = new Map<string, Promise<PaymentSourceName[]>>();
const subscribers = new Set<(userId: string, rows: PaymentSourceName[]) => void>();

const loadNames = (userId: string): Promise<PaymentSourceName[]> => {
  const cached = cache.get(userId);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('custom_payment_sources' as any)
      .select('id, name, icon, color')
      .eq('user_id', userId);
    if (error) {
      console.error('Error loading payment source names:', error);
      return [];
    }
    const rows = (data as unknown as PaymentSourceName[]) || [];
    cache.set(userId, rows);
    subscribers.forEach((fn) => fn(userId, rows));
    return rows;
  })().finally(() => {
    inflight.delete(userId);
  });

  inflight.set(userId, promise);
  return promise;
};

export const useAllPaymentSourceNames = (): PaymentSourceName[] => {
  const { user, authReady } = useAuth();
  const userId = user?.id ?? null;
  const [names, setNames] = useState<PaymentSourceName[]>(
    () => (userId ? cache.get(userId) ?? [] : []),
  );

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;

    const onUpdate = (uid: string, rows: PaymentSourceName[]) => {
      if (!cancelled && uid === userId) setNames(rows);
    };
    subscribers.add(onUpdate);

    void loadNames(userId).then((rows) => {
      if (!cancelled) setNames(rows);
    });

    return () => {
      cancelled = true;
      subscribers.delete(onUpdate);
    };
  }, [authReady, userId]);

  return names;
};
