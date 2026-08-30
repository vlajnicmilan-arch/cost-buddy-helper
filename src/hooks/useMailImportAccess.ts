import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * MAIL UVOZ — značajka je OTVORENA svakom prijavljenom korisniku
 * (odluka vlasnika proizvoda, 30.8.2026). Pravo `mail_uvoz` više NE skriva
 * sučelje; ono i dalje postoji, ali utječe isključivo na mjesečnu kvotu
 * (5 uvoza bez prava, 100 s pravom — `mail_import_consume_quota()`).
 *
 * Hook je zadržan kao jedno mjesto istine za „smije li se mail UI prikazati",
 * pa pozivatelji ostaju nepromijenjeni.
 */
export function useMailImportAccess() {
  const { user } = useAuth();
  const refetch = useCallback(async () => {}, []);
  return { hasAccess: !!user?.id, loading: false, refetch };
}
