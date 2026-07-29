/**
 * CentarNote — jedinstveni vizual globalnih obavijesti (Faza 1).
 *
 * Boja dolazi iz `--module-accent` (postavlja ModuleThemeProvider) ili se,
 * kad je modul eksplicitan, lokalno postavlja iz mape u `notifyModule.ts`.
 * NULA hardkodiranih boja.
 *
 * Faza 1: info auto-dismiss (pametno trajanje), error auto-dismiss 6s +
 * ⚠ ikona + lagani shake. STICKY NIJE UVEDEN (Faza 2).
 */
import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { noteModuleHsl, noteModuleHslMuted, type NoteModule } from '@/lib/notifyModule';
import type { FeedbackAction, FeedbackSeverity } from '@/hooks/useStatusFeedback';

interface CentarNoteProps {
  severity: FeedbackSeverity;
  module: NoteModule;
  title?: string;
  message?: string;
  action?: FeedbackAction;
  /** Trajanje u ms — pokreće animaciju progress crtice. 0 = bez crtice (sticky). */
  duration: number;
}

const MODULE_LABEL: Record<NoteModule, string> = {
  overview: 'Pregled',
  projects: 'Projekti',
  wallet: 'Novčanik',
  budgets: 'Smjer',
  krug: 'Krug',
  centar: 'Centar',
};

export const CentarNote = ({
  severity,
  module,
  title,
  message,
  action,
  duration,
}: CentarNoteProps) => {
  const accent = noteModuleHsl(module);
  const accentMuted = noteModuleHslMuted(module);
  const isError = severity === 'error';
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <motion.div
      data-testid="centar-note"
      data-severity={severity}
      data-module={module}
      className="fixed inset-0 z-[80] flex items-center justify-center p-6 pointer-events-none backdrop-blur-[2px] bg-background/25"
      style={
        {
          '--module-accent': accent,
          '--module-accent-muted': accentMuted,
        } as React.CSSProperties
      }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      {/* radijalni glow IZA kartice */}
      <div
        aria-hidden="true"
        className="absolute w-[320px] h-[320px] rounded-full blur-3xl opacity-20"
        style={{ background: 'hsl(var(--module-accent))' }}
      />

      <motion.div
        role="status"
        aria-live={isError ? 'assertive' : 'polite'}
        className={cn(
          'relative w-full max-w-[340px] rounded-[26px] border border-border/60',
          'bg-card/95 px-6 pt-7 pb-6 shadow-2xl',
          action ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        initial={{ scale: 0.82, y: 10, opacity: 0 }}
        animate={{
          scale: 1,
          y: 0,
          opacity: 1,
          ...(isError ? { x: [0, -6, 6, -3, 3, 0] } : {}),
        }}
        transition={{
          scale: { type: 'spring', stiffness: 260, damping: 22 },
          y: { type: 'spring', stiffness: 260, damping: 22 },
          opacity: { duration: 0.18 },
          x: { duration: 0.4, delay: 0.12 },
        }}
      >
        {/* diskretna oznaka modula */}
        <span
          data-testid="centar-note-module-label"
          className="absolute right-5 top-4 text-[11px] leading-none opacity-60"
          style={{ color: 'hsl(var(--module-accent-muted))' }}
        >
          {MODULE_LABEL[module] ?? MODULE_LABEL.centar}
        </span>

        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'hsl(var(--module-accent) / 0.15)' }}
        >
          <Icon
            className="h-7 w-7"
            strokeWidth={1.75}
            style={{ color: 'hsl(var(--module-accent))' }}
          />
        </div>

        {title && (
          <h2 className="mt-6 text-[19px] font-semibold leading-snug text-foreground">{title}</h2>
        )}

        {message && (
          <p
            className={cn(
              'text-[14px] leading-relaxed text-muted-foreground break-words line-clamp-4',
              title ? 'mt-3' : 'mt-6',
            )}
          >
            {message}
          </p>
        )}

        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-5 min-h-[44px] w-full rounded-xl px-4 text-sm font-semibold text-white"
            style={{ background: 'hsl(var(--module-accent))' }}
          >
            {action.label}
          </button>
        )}

        {duration > 0 && (
          <div className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
            <motion.div
              data-testid="centar-note-progress"
              className="h-full rounded-full"
              style={{ background: 'hsl(var(--module-accent))' }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: duration / 1000, ease: 'linear' }}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default CentarNote;
