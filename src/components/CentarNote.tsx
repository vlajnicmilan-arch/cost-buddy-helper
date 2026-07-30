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
import { CheckCircle2, AlertTriangle, TriangleAlert } from 'lucide-react';
import i18n from '@/i18n';
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
  /** Gašenje sticky obavijesti (gumb "U redu" i klik na pozadinu). */
  onDismiss?: () => void;
}

const MODULE_LABEL: Record<NoteModule, string> = {
  overview: 'Centar',
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
  onDismiss,
}: CentarNoteProps) => {
  const accent = noteModuleHsl(module);
  const accentMuted = noteModuleHslMuted(module);
  // Split poruke na PRVOM '\n': prvi red = naslov, ostatak = opis.
  // Ako je `title` eksplicitno zadan, poruka se ne dijeli.
  const nlIndex = !title && message ? message.indexOf('\n') : -1;
  const effectiveTitle = nlIndex > -1 ? message!.slice(0, nlIndex).trim() : title;
  const effectiveMessage = nlIndex > -1 ? message!.slice(nlIndex + 1).trim() : message;
  const isError = severity === 'error';
  const isWarning = severity === 'warning';
  const isSticky = duration === 0;
  const Icon = isError ? AlertTriangle : isWarning ? TriangleAlert : CheckCircle2;
  const effectiveAction: FeedbackAction | undefined =
    action ?? (isSticky && onDismiss ? { label: i18n.t('common.ok'), onClick: onDismiss } : undefined);
  const interactive = Boolean(effectiveAction);


  return (
    <motion.div
      data-testid="centar-note"
      data-severity={severity}
      data-module={module}
      className={cn(
        'fixed inset-0 z-[80] flex items-center justify-center p-6 backdrop-blur-[2px] bg-background/25',
        isSticky ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      onClick={isSticky ? onDismiss : undefined}
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
          interactive ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        onClick={(e) => e.stopPropagation()}
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

        {effectiveTitle && (
          <h2
            data-testid="centar-note-title"
            className="mt-6 text-[19px] font-semibold leading-snug text-foreground"
          >
            {effectiveTitle}
          </h2>
        )}

        {effectiveMessage && (
          <p
            data-testid="centar-note-description"
            className={cn(
              'text-[14px] leading-relaxed text-muted-foreground break-words line-clamp-4',
              effectiveTitle ? 'mt-3' : 'mt-6',
            )}
          >
            {effectiveMessage}
          </p>
        )}


        {effectiveAction && (
          <button
            type="button"
            data-testid="centar-note-action"
            onClick={effectiveAction.onClick}
            className="mt-5 min-h-[44px] w-full rounded-xl px-4 text-sm font-semibold text-white"
            style={{ background: 'hsl(var(--module-accent))' }}
          >
            {effectiveAction.label}
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
