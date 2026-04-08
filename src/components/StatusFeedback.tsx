import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useStatusFeedback } from '@/hooks/useStatusFeedback';

const StatusFeedback = () => {
  const { visible, type, message } = useStatusFeedback();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="status-feedback"
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.2, 1],
              opacity: 1,
              ...(type === 'error' ? { x: [0, -8, 8, -4, 4, 0] } : {}),
            }}
            transition={{
              scale: { duration: 0.4, times: [0, 0.6, 1] },
              x: { duration: 0.4, delay: 0.2 },
              opacity: { duration: 0.2 },
            }}
          >
            <div className="rounded-full bg-background/80 backdrop-blur-sm p-3 shadow-lg">
              {type === 'success' ? (
                <CheckCircle2 className="w-16 h-16 text-green-500" strokeWidth={1.5} />
              ) : (
                <XCircle className="w-16 h-16 text-destructive" strokeWidth={1.5} />
              )}
            </div>
            {message && (
              <span className="text-sm text-muted-foreground font-medium max-w-[200px] text-center truncate">
                {message}
              </span>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StatusFeedback;
