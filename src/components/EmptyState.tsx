import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateVariant = 'transactions' | 'budgets' | 'projects' | 'chart' | 'generic';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  compact?: boolean;
}

// --- SVG Illustrations ---

const TransactionsIllustration = () => (
  <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Background card */}
    <rect x="10" y="15" width="100" height="70" rx="10" fill="hsl(var(--muted))" />
    <rect x="10" y="15" width="100" height="70" rx="10" stroke="hsl(var(--border))" strokeWidth="1.5" />
    {/* Header stripe */}
    <rect x="10" y="15" width="100" height="22" rx="10" fill="hsl(var(--primary) / 0.12)" />
    <rect x="10" y="26" width="100" height="11" fill="hsl(var(--primary) / 0.12)" />
    {/* Wallet icon */}
    <rect x="20" y="22" width="12" height="9" rx="2" fill="hsl(var(--primary) / 0.5)" />
    <circle cx="29" cy="26.5" r="1.5" fill="hsl(var(--primary))" />
    {/* Empty lines */}
    <rect x="20" y="46" width="50" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.2)" />
    <rect x="80" y="46" width="15" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.15)" />
    <rect x="20" y="57" width="38" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.15)" />
    <rect x="80" y="57" width="15" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.1)" />
    <rect x="20" y="68" width="44" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.12)" />
    <rect x="80" y="68" width="15" height="5" rx="2.5" fill="hsl(var(--muted-foreground) / 0.08)" />
    {/* Plus badge */}
    <circle cx="93" cy="22" r="10" fill="hsl(var(--primary))" />
    <rect x="88.5" y="21" width="9" height="2" rx="1" fill="white" />
    <rect x="92" y="17.5" width="2" height="9" rx="1" fill="white" />
  </svg>
);

const BudgetsIllustration = () => (
  <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Target rings */}
    <circle cx="60" cy="50" r="42" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="4 3" />
    <circle cx="60" cy="50" r="30" stroke="hsl(var(--primary) / 0.3)" strokeWidth="2" />
    <circle cx="60" cy="50" r="18" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2.5" />
    {/* Center */}
    <circle cx="60" cy="50" r="8" fill="hsl(var(--primary))" />
    <circle cx="60" cy="50" r="3" fill="white" />
    {/* Progress arc (approx 60%) */}
    <circle
      cx="60" cy="50" r="30"
      stroke="hsl(var(--primary))"
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray="113 75"
      strokeDashoffset="28"
      transform="rotate(-90 60 50)"
    />
    {/* Coins / bars bottom */}
    <rect x="18" y="78" width="12" height="12" rx="3" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--border))" strokeWidth="1" />
    <rect x="34" y="73" width="12" height="17" rx="3" fill="hsl(var(--primary) / 0.35)" stroke="hsl(var(--border))" strokeWidth="1" />
    <rect x="74" y="76" width="12" height="14" rx="3" fill="hsl(var(--primary) / 0.25)" stroke="hsl(var(--border))" strokeWidth="1" />
    <rect x="90" y="71" width="12" height="19" rx="3" fill="hsl(var(--primary) / 0.4)" stroke="hsl(var(--border))" strokeWidth="1" />
  </svg>
);

const ProjectsIllustration = () => (
  <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* Folder back */}
    <path d="M10 35 Q10 28 17 28 L45 28 L50 22 L103 22 Q110 22 110 29 L110 75 Q110 82 103 82 L17 82 Q10 82 10 75 Z" fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.5" />
    {/* Folder front */}
    <rect x="10" y="35" width="100" height="47" rx="7" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
    {/* Tab */}
    <path d="M10 35 L10 29 Q10 24 15 24 L43 24 L47 29 L10 29" fill="hsl(var(--primary) / 0.25)" />
    {/* Lines inside */}
    <rect x="22" y="48" width="40" height="4" rx="2" fill="hsl(var(--muted-foreground) / 0.2)" />
    <rect x="22" y="57" width="28" height="4" rx="2" fill="hsl(var(--muted-foreground) / 0.15)" />
    <rect x="22" y="66" width="34" height="4" rx="2" fill="hsl(var(--muted-foreground) / 0.1)" />
    {/* Plus badge */}
    <circle cx="93" cy="48" r="10" fill="hsl(var(--primary))" />
    <rect x="88.5" y="47" width="9" height="2" rx="1" fill="white" />
    <rect x="92" y="43.5" width="2" height="9" rx="1" fill="white" />
  </svg>
);

const ChartIllustration = () => (
  <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect x="5" y="40" width="10" height="15" rx="2" fill="hsl(var(--muted-foreground) / 0.2)" />
    <rect x="20" y="30" width="10" height="25" rx="2" fill="hsl(var(--muted-foreground) / 0.15)" />
    <rect x="35" y="20" width="10" height="35" rx="2" fill="hsl(var(--muted-foreground) / 0.12)" />
    <rect x="50" y="35" width="10" height="20" rx="2" fill="hsl(var(--muted-foreground) / 0.1)" />
    <rect x="65" y="25" width="10" height="30" rx="2" fill="hsl(var(--muted-foreground) / 0.08)" />
    <line x1="2" y1="55" x2="78" y2="55" stroke="hsl(var(--border))" strokeWidth="1.5" />
  </svg>
);

const illustrationMap: Record<EmptyStateVariant, React.FC> = {
  transactions: TransactionsIllustration,
  budgets: BudgetsIllustration,
  projects: ProjectsIllustration,
  chart: ChartIllustration,
  generic: ChartIllustration,
};

export const EmptyState = ({
  variant = 'generic',
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) => {
  const Illustration = illustrationMap[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-6 px-4' : 'py-10 px-6',
        className
      )}
    >
      {/* Illustration */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className={cn(
          'mx-auto mb-4',
          compact ? 'w-24 h-20' : 'w-36 h-28'
        )}
      >
        <Illustration />
      </motion.div>

      {/* Floating dots decoration */}
      <div className="relative w-full flex justify-center mb-1">
        <motion.span
          className="absolute -left-2 top-0 w-1.5 h-1.5 rounded-full bg-primary/30"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute right-4 top-1 w-1 h-1 rounded-full bg-primary/20"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
      </div>

      <motion.h3
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}
      >
        {title}
      </motion.h3>

      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-1 text-sm text-muted-foreground max-w-xs"
        >
          {description}
        </motion.p>
      )}

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mt-4"
        >
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
};
