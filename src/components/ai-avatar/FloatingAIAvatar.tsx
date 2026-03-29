import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AvatarMood } from './useAvatarMood';
import { GhostAvatar } from './GhostAvatar';
import { useBlinking } from './useBlinking';
import { useEyeMovement } from './useEyeMovement';

interface FloatingAIAvatarProps {
  mood?: AvatarMood;
  onQuickTap?: () => void;
  onLongPress?: () => void;
  showTooltip?: boolean;
  tooltipMessage?: string;
  className?: string;
}

const getMoodDropShadow = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return {
        filter: [
          'drop-shadow(0 0 12px rgba(0, 210, 255, 0.5))',
          'drop-shadow(0 0 25px rgba(0, 210, 255, 0.8))',
          'drop-shadow(0 0 12px rgba(0, 210, 255, 0.5))',
        ],
      };
    case 'thinking':
      return {
        filter: [
          'drop-shadow(0 0 10px rgba(0, 150, 255, 0.3))',
          'drop-shadow(0 0 20px rgba(0, 150, 255, 0.6))',
          'drop-shadow(0 0 10px rgba(0, 150, 255, 0.3))',
        ],
      };
    case 'worried':
      return {
        filter: [
          'drop-shadow(0 0 12px rgba(255, 140, 50, 0.4))',
          'drop-shadow(0 0 18px rgba(255, 120, 30, 0.6))',
          'drop-shadow(0 0 12px rgba(255, 140, 50, 0.4))',
        ],
      };
    case 'proud':
      return {
        filter: [
          'drop-shadow(0 0 15px rgba(255, 215, 0, 0.5))',
          'drop-shadow(0 0 30px rgba(255, 215, 0, 0.8))',
          'drop-shadow(0 0 15px rgba(255, 215, 0, 0.5))',
        ],
      };
    default:
      return {
        filter: [
          'drop-shadow(0 0 8px rgba(0, 200, 255, 0.25))',
          'drop-shadow(0 0 14px rgba(0, 200, 255, 0.4))',
          'drop-shadow(0 0 8px rgba(0, 200, 255, 0.25))',
        ],
      };
  }
};

const getMoodGlowTransition = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return { duration: 1.2, repeat: Infinity, ease: "easeInOut" as const };
    case 'thinking':
      return { duration: 2.5, repeat: Infinity, ease: "easeInOut" as const };
    case 'worried':
      return { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const };
    case 'proud':
      return { duration: 1.5, repeat: Infinity, ease: "easeInOut" as const };
    default:
      return { duration: 3, repeat: Infinity, ease: "easeInOut" as const };
  }
};

const getMoodAnimation = (mood: AvatarMood) => {
  switch (mood) {
    case 'happy':
      return { scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] };
    case 'thinking':
      return { rotate: [0, -5, 5, -3, 3, 0], y: [0, -2, 0] };
    case 'worried':
      return { scale: [1, 0.97, 1], x: [-1, 1, -1, 0] };
    case 'proud':
      return { scale: [1, 1.08, 1.04, 1.08, 1], y: [0, -4, 0] };
    default:
      return { scale: 1, rotate: 0 };
  }
};

const getMoodTransition = (mood: AvatarMood): { duration: number; repeat?: number; ease?: "easeInOut" | "easeOut" } => {
  switch (mood) {
    case 'happy':
      return { duration: 0.6, repeat: 2, ease: "easeInOut" };
    case 'thinking':
      return { duration: 2, repeat: Infinity, ease: "easeInOut" };
    case 'worried':
      return { duration: 0.3, repeat: 3, ease: "easeInOut" };
    case 'proud':
      return { duration: 1.5, repeat: 1, ease: "easeOut" };
    default:
      return { duration: 0.3 };
  }
};

export const FloatingAIAvatar = ({
  mood = 'neutral',
  onQuickTap,
  onLongPress,
  showTooltip = false,
  tooltipMessage,
  className,
}: FloatingAIAvatarProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const wasLongPress = useRef(false);
  const isBlinking = useBlinking();
  const eyePosition = useEyeMovement(mood);

  const handlePressStart = useCallback(() => {
    setIsPressed(true);
    wasLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      wasLongPress.current = true;
      setIsPressed(false);
      onLongPress?.();
    }, 600);
  }, [onLongPress]);

  const handlePressEnd = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!wasLongPress.current) {
      onQuickTap?.();
    }
  }, [onQuickTap]);

  const handlePressCancel = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && tooltipMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-card border border-border rounded-xl shadow-lg max-w-[200px] text-sm"
          >
            <p className="text-foreground">{tooltipMessage}</p>
            <div className="absolute -bottom-1.5 right-4 w-3 h-3 rotate-45 bg-card border-r border-b border-border" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar container */}
      <motion.button
        className={cn(
          "relative w-[112px] h-[112px] cursor-pointer select-none touch-none bg-transparent",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        )}
        style={{ background: 'transparent' }}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressCancel}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressCancel}
        animate={{ scale: isPressed ? 0.9 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        aria-label="AI Asistent"
      >
        {/* Floating animation */}
        <motion.div
          className="relative w-full h-full"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Mood expression animation */}
          <motion.div
            className="relative w-full h-full"
            animate={getMoodAnimation(mood)}
            transition={getMoodTransition(mood)}
          >
            {/* Glow wrapper with drop-shadow */}
            <motion.div
              className="w-full h-full flex items-center justify-center"
              animate={getMoodDropShadow(mood)}
              transition={getMoodGlowTransition(mood)}
            >
              <GhostAvatar
                mood={mood}
                size={112}
                isBlinking={isBlinking}
                eyePosition={eyePosition}
              />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Pulse ring for interaction hint */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/30"
          animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      </motion.button>
    </div>
  );
};
