import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Horizontal scrollable wrapper for the Projects detail TabsList.
 *
 * Pure visual discoverability signal for overflow tabs on narrow viewports:
 * - left edge fade appears only when the strip is scrolled past the start
 * - right edge fade appears only when there is more content to the right
 *
 * No chevron buttons, no sticky tab, no navigation logic — fades are
 * pointer-events-none decorations only.
 */
export function ProjectTabsStrip({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft < maxScroll - 1);
    };

    update();
    el.addEventListener('scroll', update, { passive: true });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className="relative mb-6">
      <div ref={scrollerRef} className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity duration-150 sm:hidden ${
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity duration-150 sm:hidden ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
