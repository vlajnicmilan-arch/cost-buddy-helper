import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BACK_FALLBACK_PATH,
  readHistoryIdx,
  shouldFallbackToHome,
} from '@/lib/navigation/goBackOrHome';

/**
 * Zajednički povratak: `navigate(-1)` kad povijest postoji, inače Centar.
 * Vidi `src/lib/navigation/goBackOrHome.ts` za odabrani signal i obrazloženje.
 */
export function useGoBackOrHome(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (shouldFallbackToHome({ historyIdx: readHistoryIdx(), locationKey: location.key ?? null })) {
      navigate(BACK_FALLBACK_PATH, { replace: true });
      return;
    }
    navigate(-1);
  }, [navigate, location.key]);
}
