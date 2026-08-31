/**
 * useAuthedFetchGate — jedno mjesto koje odgovara na pitanje
 * „smije li se sada dohvaćati iz oblaka?".
 *
 * Zašto postoji: RLS politike zovu SECURITY DEFINER funkcije (npr.
 * `is_project_participant_active`) na koje `anon` nema pravo. Ako upit krene
 * prije nego se prijava razriješi (sporija obnova sesije), PostgREST ga izvodi
 * kao `anon` → `permission denied for function ...`.
 *
 * Pravila (identična onima dokazanima na `useExpenseFetch`):
 *  - ne kreće ništa dok `authReady` nije `true`,
 *  - ne kreće ako nema korisnika,
 *  - kod straničenja se prije svake sljedeće stranice provjerava da je
 *    identitet i dalje živ (`isIdentityAlive`) i staje bez upita,
 *  - krnji rezultat se ne upisuje u state ni u predmemoriju (pozivatelj
 *    prekida petlju i odustaje od zapisa).
 *
 * Brana NE mijenja nijedno pravilo pristupa — samo *kada* upit smije krenuti.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface AuthedFetchGate {
  /** Stanje prijave je razriješeno (poznato je jesmo li prijavljeni ili ne). */
  authReady: boolean;
  /** Prijavljeni korisnik kad je stanje razriješeno, inače `null`. */
  userId: string | null;
  /** `true` samo kad je prijava razriješena i korisnik postoji. */
  canFetch: boolean;
  /**
   * Provjera između stranica straničenja: je li identitet i dalje živ.
   * Opcionalni `expectedUserId` hvata i promjenu korisnika usred dohvata.
   */
  isIdentityAlive: (expectedUserId?: string | null) => boolean;
}

export const useAuthedFetchGate = (): AuthedFetchGate => {
  const { user, authReady } = useAuth();
  const userId = authReady ? (user?.id ?? null) : null;

  // Živi identitet — čita se između stranica, pa mora biti ref, ne closure.
  const liveUserIdRef = useRef<string | null>(userId);
  useEffect(() => {
    liveUserIdRef.current = userId;
  }, [userId]);

  const isIdentityAlive = useCallback((expectedUserId?: string | null) => {
    const live = liveUserIdRef.current;
    if (!live) return false;
    if (expectedUserId != null && expectedUserId !== live) return false;
    return true;
  }, []);

  return {
    authReady: !!authReady,
    userId,
    canFetch: !!authReady && !!userId,
    isIdentityAlive,
  };
};
