import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * HorizontalCardRail — jedan zajednički recept za SVE vodoravne kartične
 * popise. Zamjenjuje sistemski sivi scrollbar s tri sloja:
 *  1. "ima još"      → provirivanje sljedeće kartice + scroll-snap
 *  2. "gdje je kraj" → fade ruba (mask-image) + diskretne strelice na hover
 *  3. "dokle sam"    → tanka gradient nit ispod liste (tirkiz → ljubičasta,
 *                      tokeni donje navigacije: overview → budgets)
 *
 * Ponašanje skrolanja (prst/kotačić/trackpad) ostaje netaknuto; skriva se
 * samo scrollbar i to isključivo na ovoj listi (ne globalno).
 */

/** Boje niti = tokeni BottomNav modula (MODULE_HSL.overview → MODULE_HSL.budgets). */
const THREAD_GRADIENT = 'linear-gradient(90deg, hsl(172 66% 40%), hsl(258 90% 66%))';

interface HorizontalCardRailProps {
  children: React.ReactNode;
  /** Klase vanjskog omotača. */
  className?: string;
  /** Klase scroll kontejnera (npr. `-mx-3 px-3`). */
  scrollClassName?: string;
  /** Klase reda kartica (npr. `gap-3`). */
  contentClassName?: string;
  ariaLabel?: string;
}

interface RailMetrics {
  overflow: boolean;
  atStart: boolean;
  atEnd: boolean;
  progress: number;
}

const INITIAL: RailMetrics = { overflow: false, atStart: true, atEnd: true, progress: 0 };

export const HorizontalCardRail = ({
  children,
  className,
  scrollClassName,
  contentClassName,
  ariaLabel,
}: HorizontalCardRailProps) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<RailMetrics>(INITIAL);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const overflow = max > 4;
    const left = el.scrollLeft;
    setMetrics({
      overflow,
      atStart: left <= 2,
      atEnd: !overflow || left >= max - 2,
      progress: overflow ? Math.min(1, Math.max(0, left / max)) : 0,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const step = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-rail-item], :scope > * > *');
    const amount = card?.offsetWidth ? card.offsetWidth + 12 : Math.round(el.clientWidth * 0.8);
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  // Fade ruba: maska se pojavljuje samo na strani gdje ima još sadržaja.
  const fadeLeft = metrics.overflow && !metrics.atStart;
  const fadeRight = metrics.overflow && !metrics.atEnd;
  const maskImage = fadeLeft || fadeRight
    ? `linear-gradient(to right, transparent 0px, black ${fadeLeft ? '28px' : '0px'}, black calc(100% - ${fadeRight ? '28px' : '0px'}), transparent 100%)`
    : undefined;

  const arrowCls =
    'absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(hover:hover)]:flex items-center justify-center ' +
    'w-8 h-8 rounded-full border border-border/60 bg-background/90 backdrop-blur-sm shadow-sm ' +
    'text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity';

  return (
    <div className={cn('relative group', className)}>
      <div
        ref={scrollRef}
        onScroll={measure}
        tabIndex={0}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          'overflow-x-auto overflow-y-hidden scrollbar-hide snap-x snap-proximity scroll-smooth outline-none',
          scrollClassName,
        )}
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <div className={cn('flex', contentClassName)}>{children}</div>
      </div>

      {metrics.overflow && !metrics.atStart && (
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t('common.scrollLeft', 'Pomakni lijevo')}
          className={cn(arrowCls, 'left-0')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {metrics.overflow && !metrics.atEnd && (
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t('common.scrollRight', 'Pomakni desno')}
          className={cn(arrowCls, 'right-0')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {metrics.overflow && (
        <div
          data-testid="rail-thread"
          aria-hidden
          className="mt-1 h-[3px] rounded-full bg-muted/30 overflow-hidden"
        >
          <div
            className="h-full rounded-full transition-[width] duration-150 ease-out"
            style={{
              width: `${Math.max(12, metrics.progress * 100)}%`,
              background: THREAD_GRADIENT,
            }}
          />
        </div>
      )}
    </div>
  );
};
