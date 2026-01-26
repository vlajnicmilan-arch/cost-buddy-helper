import { useState, useEffect } from 'react';

// Hook for blinking animation - natural human blink timing
export const useBlinking = () => {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const scheduleBlink = () => {
      // Humans blink every 3-5 seconds on average
      const delay = 3000 + Math.random() * 2000;
      
      timeoutId = setTimeout(() => {
        setIsBlinking(true);
        
        // Human blink lasts about 150-200ms
        setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    };

    scheduleBlink();
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return isBlinking;
};
