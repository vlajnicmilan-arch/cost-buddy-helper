import { useState, useEffect, useRef, lazy, Suspense } from 'react';
const Confetti = lazy(() => import('react-confetti'));
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

interface WelcomeConfettiProps {
  displayName: string;
  onComplete: () => void;
}

export const WelcomeConfetti = ({ displayName, onComplete }: WelcomeConfettiProps) => {
  const { t } = useTranslation();
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showConfetti, setShowConfetti] = useState(true);
  const [numberOfPieces, setNumberOfPieces] = useState(300);
  const onCompleteRef = useRef(onComplete);
  
  // Keep ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Gradually reduce confetti
    const reduceTimer = setTimeout(() => {
      setNumberOfPieces(100);
    }, 2000);

    // Stop confetti
    const stopTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 4000);

    // Complete animation and hide overlay
    const completeTimer = setTimeout(() => {
      onCompleteRef.current();
    }, 5000);

    return () => {
      clearTimeout(reduceTimer);
      clearTimeout(stopTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  const confettiColors = [
    '#21D4AE', // primary teal
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#3b82f6', // blue
    '#22c55e', // green
    '#ec4899', // pink
    '#f97316', // orange
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        {/* Confetti */}
        {showConfetti && (
          <Suspense fallback={null}>
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            numberOfPieces={numberOfPieces}
            colors={confettiColors}
            recycle={false}
            gravity={0.3}
          />
        )}

        {/* Welcome message */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.5, opacity: 0, y: -50 }}
          transition={{ 
            type: "spring", 
            damping: 15, 
            stiffness: 100,
            delay: 0.2 
          }}
          className="text-center p-8 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-2xl max-w-md mx-4"
        >
          <motion.div
            animate={{ 
              rotate: [0, 10, -10, 10, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ 
              duration: 0.8, 
              delay: 0.5,
              repeat: 2,
              repeatDelay: 1
            }}
            className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-4"
          >
            <Sparkles className="w-10 h-10 text-primary" />
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-bold mb-2"
          >
            {t('welcome.title', 'Dobrodošli')}, {displayName}! 🎉
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-muted-foreground text-lg"
          >
            {t('welcome.subtitle', 'Spremni ste za upravljanje financijama!')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-4 text-sm text-muted-foreground"
          >
            {t('welcome.autoHide', 'Automatski nestaje za trenutak...')}
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
