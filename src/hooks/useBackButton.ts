import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook that intercepts the mobile back button (popstate event).
 * When a dialog/overlay is open, pressing back closes it instead of navigating away.
 * 
 * Usage: useBackButton(isOpen, onClose)
 */
export function useBackButton(isOpen: boolean, onClose: () => void) {
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const pushedRef = useRef(false);

  const handlePopState = useCallback((e: PopStateEvent) => {
    if (isOpenRef.current) {
      e.preventDefault();
      onClose();
      pushedRef.current = false;
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      // Push a dummy state so back button triggers popstate
      window.history.pushState({ backButton: true }, '');
      pushedRef.current = true;
    }

    if (!isOpen && pushedRef.current) {
      // Dialog closed programmatically (not via back button), clean up the history entry
      window.history.back();
      pushedRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handlePopState]);
}
