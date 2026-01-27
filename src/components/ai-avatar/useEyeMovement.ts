import { useState, useEffect, useCallback } from 'react';
import { AvatarMood } from './useAvatarMood';

export interface EyePosition {
  x: number;
  y: number;
}

// Predefined eye positions simulating screen scanning
const scanPositions: EyePosition[] = [
  { x: 0, y: 0 },      // center
  { x: -4, y: -2 },    // top-left
  { x: 4, y: -2 },     // top-right
  { x: 3, y: 2 },      // bottom-right
  { x: -3, y: 2 },     // bottom-left
  { x: 0, y: -3 },     // top
  { x: 0, y: 3 },      // bottom
  { x: -5, y: 0 },     // left
  { x: 5, y: 0 },      // right
  { x: 2, y: -1 },     // slight top-right
  { x: -2, y: 1 },     // slight bottom-left
];

export const useEyeMovement = (mood: AvatarMood, isActive: boolean = true) => {
  const [eyePosition, setEyePosition] = useState<EyePosition>({ x: 0, y: 0 });

  const getRandomPosition = useCallback((): EyePosition => {
    // Get a random position from scan positions
    const randomIndex = Math.floor(Math.random() * scanPositions.length);
    return scanPositions[randomIndex];
  }, []);

  useEffect(() => {
    // Only animate eyes when in neutral mood and active
    if (mood !== 'neutral' || !isActive) {
      setEyePosition({ x: 0, y: 0 });
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const moveEyes = () => {
      // 70% chance to look somewhere, 30% chance to return to center
      const shouldLookAround = Math.random() > 0.3;
      
      if (shouldLookAround) {
        setEyePosition(getRandomPosition());
      } else {
        setEyePosition({ x: 0, y: 0 });
      }

      // Schedule next movement - between 1.5 and 3.5 seconds
      const nextDelay = 1500 + Math.random() * 2000;
      timeoutId = setTimeout(moveEyes, nextDelay);
    };

    // Start with a slight delay
    timeoutId = setTimeout(moveEyes, 1000);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [mood, isActive, getRandomPosition]);

  return eyePosition;
};
