import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const FeedbackDialog = lazy(() =>
  import('./FeedbackDialog').then((m) => ({ default: m.FeedbackDialog }))
);

// Routes where FAB should NOT appear
const HIDDEN_ROUTES = [
  '/auth',
  '/onboarding',
  '/setup',
  '/install',
  '/reset-password',
  '/paywall',
  '/landing',
  '/unsubscribe',
];
const HIDDEN_PREFIXES = ['/join-', '/p/'];

interface FeedbackFABProps {
  className?: string;
}

export const FeedbackFAB = ({ className }: FeedbackFABProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const path = location.pathname;
  const hidden =
    HIDDEN_ROUTES.includes(path) || HIDDEN_PREFIXES.some((p) => path.startsWith(p));

  if (hidden) return null;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('feedbackForm.fabLabel', 'Pošalji povratnu informaciju')}
        title={t('feedbackForm.fabLabel', 'Pošalji povratnu informaciju')}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 20 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          // Position: above BottomNav, to the LEFT of the FloatingAIAvatar (which sits at right-2/3)
          'fixed bottom-[78px] right-[76px] sm:right-[84px] z-40',
          'w-11 h-11 rounded-full',
          'bg-card/95 backdrop-blur border border-border shadow-lg',
          'flex items-center justify-center',
          'text-muted-foreground hover:text-primary hover:border-primary/40',
          'transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className
        )}
      >
        <MessageSquarePlus className="w-5 h-5" />
      </motion.button>

      {open && (
        <Suspense fallback={null}>
          <FeedbackDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
};
