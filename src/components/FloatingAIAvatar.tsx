import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import aiAvatarImage from '@/assets/ai-avatar.png';

export type AvatarMood = 'happy' | 'thinking' | 'worried' | 'proud' | 'neutral';

interface FloatingAIAvatarProps {
  mood?: AvatarMood;
  onQuickTap?: () => void;
  onLongPress?: () => void;
  showTooltip?: boolean;
  tooltipMessage?: string;
  className?: string;
}

// Facial expression configurations for each mood
const moodExpressions: Record<AvatarMood, {
  leftEyebrow: { rotate: number; y: number };
  rightEyebrow: { rotate: number; y: number };
  mouth: { scaleX: number; scaleY: number; y: number; rotate: number };
}> = {
  happy: {
    leftEyebrow: { rotate: -10, y: -2 },
    rightEyebrow: { rotate: 10, y: -2 },
    mouth: { scaleX: 1.2, scaleY: 1, y: 0, rotate: 0 },
  },
  thinking: {
    leftEyebrow: { rotate: 15, y: 0 },
    rightEyebrow: { rotate: -5, y: -3 },
    mouth: { scaleX: 0.7, scaleY: 0.8, y: 1, rotate: -5 },
  },
  worried: {
    leftEyebrow: { rotate: 20, y: 2 },
    rightEyebrow: { rotate: -20, y: 2 },
    mouth: { scaleX: 0.8, scaleY: 0.6, y: 2, rotate: 0 },
  },
  proud: {
    leftEyebrow: { rotate: -15, y: -4 },
    rightEyebrow: { rotate: 15, y: -4 },
    mouth: { scaleX: 1.3, scaleY: 1.2, y: -1, rotate: 0 },
  },
  neutral: {
    leftEyebrow: { rotate: 0, y: 0 },
    rightEyebrow: { rotate: 0, y: 0 },
    mouth: { scaleX: 1, scaleY: 1, y: 0, rotate: 0 },
  },
};

const moodColors: Record<AvatarMood, string> = {
  happy: 'from-green-400/30 to-emerald-500/20',
  thinking: 'from-blue-400/30 to-indigo-500/20',
  worried: 'from-orange-400/30 to-amber-500/20',
  proud: 'from-yellow-400/30 to-amber-400/20',
  neutral: 'from-primary/20 to-primary/10',
};

// Animated facial expressions component
const FacialExpressions = ({ mood, isBlinking }: { mood: AvatarMood; isBlinking: boolean }) => {
  const expression = moodExpressions[mood];
  
  return (
    <>
      {/* Left eyebrow */}
      <motion.div
        className="absolute bg-[#2a5a5a] rounded-full"
        style={{
          width: '16%',
          height: '4%',
          top: '32%',
          left: '22%',
          transformOrigin: 'center',
        }}
        animate={{
          rotate: expression.leftEyebrow.rotate,
          y: expression.leftEyebrow.y,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      
      {/* Right eyebrow */}
      <motion.div
        className="absolute bg-[#2a5a5a] rounded-full"
        style={{
          width: '16%',
          height: '4%',
          top: '32%',
          right: '22%',
          transformOrigin: 'center',
        }}
        animate={{
          rotate: expression.rightEyebrow.rotate,
          y: expression.rightEyebrow.y,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />

      {/* Left eye blink overlay */}
      <motion.div
        className="absolute bg-[#d4e8e8] rounded-full"
        style={{
          width: '18%',
          height: '8%',
          top: '38%',
          left: '24%',
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: isBlinking ? 1 : 0 }}
        transition={{ duration: 0.05 }}
      />
      
      {/* Right eye blink overlay */}
      <motion.div
        className="absolute bg-[#d4e8e8] rounded-full"
        style={{
          width: '18%',
          height: '8%',
          top: '38%',
          right: '24%',
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: isBlinking ? 1 : 0 }}
        transition={{ duration: 0.05 }}
      />

      {/* Mouth expression overlay */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '20%',
          height: '8%',
          bottom: '28%',
          left: '50%',
          x: '-50%',
          background: mood === 'happy' || mood === 'proud' 
            ? 'linear-gradient(to bottom, transparent 40%, #e85a7a 40%)' 
            : mood === 'worried'
            ? 'linear-gradient(to top, transparent 40%, #e85a7a 40%)'
            : '#e85a7a',
          borderRadius: mood === 'happy' || mood === 'proud' ? '0 0 50% 50%' : mood === 'worried' ? '50% 50% 0 0' : '50%',
        }}
        animate={{
          scaleX: expression.mouth.scaleX,
          scaleY: expression.mouth.scaleY,
          y: expression.mouth.y,
          rotate: expression.mouth.rotate,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </>
  );
};

// Hook for blinking animation
const useBlinking = () => {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 3000;
      return setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    };

    const timer = scheduleBlink();
    return () => clearTimeout(timer);
  }, []);

  return isBlinking;
};

// Animated halo component
const AnimatedHalo = () => {
  return (
    <motion.div
      className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-3"
      animate={{
        y: [0, -3, 0, -2, 0],
        rotateZ: [-5, 5, -3, 4, -5],
        scale: [1, 1.05, 1, 1.03, 1],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Halo ring */}
      <motion.div
        className="w-full h-full rounded-full border-2 border-cyan-300/60"
        style={{
          background: 'linear-gradient(135deg, rgba(103, 232, 249, 0.3), rgba(34, 211, 238, 0.1))',
          boxShadow: '0 0 8px rgba(103, 232, 249, 0.4)',
        }}
        animate={{
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.div>
  );
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
          "relative w-[72px] h-[72px] rounded-full cursor-pointer select-none touch-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        )}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressCancel}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handlePressCancel}
        animate={{
          scale: isPressed ? 0.9 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        aria-label="AI Asistent"
      >
        {/* Glow effect based on mood */}
        <motion.div
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-br blur-lg",
            moodColors[mood]
          )}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Avatar image with floating animation */}
        <motion.div
          className="relative w-full h-full"
          animate={{
            y: [0, -4, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Animated Halo */}
          <AnimatedHalo />
          
          {/* Avatar image */}
          <motion.div
            className="relative w-full h-full"
            animate={{
              rotate: mood === 'thinking' ? [0, -5, 5, 0] : 0,
              scale: mood === 'proud' ? [1, 1.1, 1] : 1,
            }}
            transition={{
              duration: mood === 'thinking' ? 2 : 0.5,
              repeat: mood === 'thinking' ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            <img
              src={aiAvatarImage}
              alt="AI Asistent"
              className="w-full h-full object-contain drop-shadow-md"
            />
            
            {/* Animated facial expressions */}
            <FacialExpressions mood={mood} isBlinking={isBlinking} />
          </motion.div>
        </motion.div>

        {/* Pulse ring for interaction hint */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/30"
          animate={{
            scale: [1, 1.3],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      </motion.button>
    </div>
  );
};

// Hook to manage avatar mood based on app events
export const useAvatarMood = () => {
  const [mood, setMood] = useState<AvatarMood>('neutral');
  const [tooltipMessage, setTooltipMessage] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

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

  // Listen for app events
  useEffect(() => {
    const handleIncomeAdded = () => {
      showMood('happy', 'Super! Novi prihod zabilježen! 💰');
    };

    const handleExpenseAdded = (e: CustomEvent) => {
      const { amount, budgetExceeded } = e.detail || {};
      if (budgetExceeded) {
        showMood('worried', 'Pazi, približavaš se limitu budžeta.');
      } else {
        showMood('neutral');
      }
    };

    const handleBudgetExceeded = () => {
      showMood('worried', 'Budžet je prekoračen. Razmisli o prioritetima.');
    };

    const handleSavingsGoalReached = () => {
      showMood('proud', 'Čestitam! Cilj štednje je postignut! 🎉');
    };

    const handleAnalyzing = () => {
      showMood('thinking', 'Analiziram tvoje podatke...');
    };

    window.addEventListener('incomeAdded', handleIncomeAdded);
    window.addEventListener('expenseAdded', handleExpenseAdded as EventListener);
    window.addEventListener('budgetExceeded', handleBudgetExceeded);
    window.addEventListener('savingsGoalReached', handleSavingsGoalReached);
    window.addEventListener('aiAnalyzing', handleAnalyzing);

    return () => {
      window.removeEventListener('incomeAdded', handleIncomeAdded);
      window.removeEventListener('expenseAdded', handleExpenseAdded as EventListener);
      window.removeEventListener('budgetExceeded', handleBudgetExceeded);
      window.removeEventListener('savingsGoalReached', handleSavingsGoalReached);
      window.removeEventListener('aiAnalyzing', handleAnalyzing);
    };
  }, [showMood]);

  return { mood, showTooltip, tooltipMessage, showMood };
};
