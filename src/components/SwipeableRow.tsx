import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { motion, useMotionValue, useAnimation, type PanInfo } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHaptics } from '@/hooks/useHaptics';
import { resolveSwipeSnap, clampSwipeOffset } from '@/lib/swipeThreshold';
import { cn } from '@/lib/utils';

interface SwipeableRowProps {
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  /** When true, swipe is disabled (e.g. bulk-select mode). */
  disabled?: boolean;
  /** Per-action width in px. Two actions = total reveal width = 2 × this. Default 80. */
  actionWidth?: number;
  className?: string;
}

/**
 * Swipe-left to reveal Edit (amber) + Delete (destructive) actions.
 * Right swipe is ignored. Tap outside auto-closes. Disabled = passthrough.
 *
 * Keyboard/screen-reader users have no swipe — they continue to use tap → dialog
 * (handled by the wrapped child). The revealed action buttons are real <button>
 * elements with aria-labels for completeness.
 */
export const SwipeableRow = ({
  children,
  onEdit,
  onDelete,
  disabled = false,
  actionWidth = 80,
  className,
}: SwipeableRowProps) => {
  const { t } = useTranslation();
  const { mediumTap } = useHaptics();
  const totalReveal = actionWidth * 2;
  const x = useMotionValue(0);
  const controls = useAnimation();
  const [isOpen, setIsOpen] = useState(false);
  const wasOpenRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } });
    setIsOpen(false);
    wasOpenRef.current = false;
  };

  const open = () => {
    controls.start({ x: -totalReveal, transition: { type: 'spring', stiffness: 500, damping: 40 } });
    setIsOpen(true);
    if (!wasOpenRef.current) {
      mediumTap();
      wasOpenRef.current = true;
    }
  };

  // Auto-close when entering disabled state (bulk-select toggled on)
  useEffect(() => {
    if (disabled && isOpen) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Auto-close on outside pointerdown
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDragEnd = (_: PointerEvent, info: PanInfo) => {
    const clamped = clampSwipeOffset(info.offset.x + (isOpen ? -totalReveal : 0), totalReveal);
    const snap = resolveSwipeSnap(clamped, { actionWidth: totalReveal });
    if (snap === 'open') open();
    else close();
  };

  const handleAction = (cb: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    // Small delay so the close animation reads before the dialog/snackbar
    setTimeout(cb, 80);
  };

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={rootRef} className={cn('relative overflow-hidden', className)}>
      {/* Action layer (revealed under foreground) */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: totalReveal }}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          onClick={handleAction(onEdit)}
          aria-label={t('transactions.swipe.editAria', 'Uredi transakciju')}
          tabIndex={isOpen ? 0 : -1}
          className="flex flex-col items-center justify-center gap-0.5 text-xs font-medium bg-amber-500 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          style={{ width: actionWidth }}
        >
          <Pencil className="w-4 h-4" />
          <span>{t('transactions.swipe.edit', 'Uredi')}</span>
        </button>
        <button
          type="button"
          onClick={handleAction(onDelete)}
          aria-label={t('transactions.swipe.deleteAria', 'Obriši transakciju')}
          tabIndex={isOpen ? 0 : -1}
          className="flex flex-col items-center justify-center gap-0.5 text-xs font-medium bg-destructive text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          style={{ width: actionWidth }}
        >
          <Trash2 className="w-4 h-4" />
          <span>{t('transactions.swipe.delete', 'Obriši')}</span>
        </button>
      </div>

      {/* Foreground (the actual row) */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -totalReveal, right: 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        animate={controls}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className="relative bg-background touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
};
