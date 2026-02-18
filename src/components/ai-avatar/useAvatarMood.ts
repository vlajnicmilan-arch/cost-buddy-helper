import { useState, useCallback, useEffect } from 'react';
import { useAppState, AvatarMood } from '@/contexts/AppStateContext';

export type { AvatarMood };

export const useAvatarMood = () => {
  const [mood, setMood] = useState<AvatarMood>('neutral');
  const [tooltipMessage, setTooltipMessage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const { onAvatarEvent } = useAppState();

  const showMood = useCallback((newMood: AvatarMood, message?: string, duration = 3000) => {
    setMood(newMood);
    if (message) {
      setTooltipMessage(message);
      setShowTooltip(true);
      setTimeout(() => {
        setShowTooltip(false);
        setTimeout(() => setMood('neutral'), 500);
      }, duration);
    } else {
      setTimeout(() => setMood('neutral'), duration);
    }
  }, []);

  // Subscribe to avatar events via Context
  useEffect(() => {
    const unsubscribe = onAvatarEvent((newMood, message) => {
      showMood(newMood, message);
    });
    return unsubscribe;
  }, [onAvatarEvent, showMood]);

  return { mood, showTooltip, tooltipMessage, showMood };
};
