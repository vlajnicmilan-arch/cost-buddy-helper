import { useEffect, useRef } from 'react';
import { useBackButtonContext } from '@/contexts/BackButtonContext';

/**
 * Hook that registers a dialog/overlay with the global back button manager.
 * 
 * When the back button is pressed on mobile:
 * - If this dialog is the topmost open one, it gets closed
 * - If no dialogs are open, the app navigates to the previous page or stays on root
 * 
 * Usage: useBackButton(isOpen, onClose, priority?)
 * - priority: higher number = closed first when multiple dialogs open (default: 0)
 */

let idCounter = 0;

export function useBackButton(isOpen: boolean, onClose: () => void, priority = 0) {
  const { register, unregister } = useBackButtonContext();
  // Stable ID per hook instance
  const idRef = useRef<string>(`back-${++idCounter}`);

  // Register/update whenever isOpen, onClose or priority changes
  useEffect(() => {
    register(idRef.current, isOpen, onClose, priority);
  }, [isOpen, onClose, priority, register]);

  // Cleanup on unmount
  useEffect(() => {
    const id = idRef.current;
    return () => unregister(id);
  }, [unregister]);
}
