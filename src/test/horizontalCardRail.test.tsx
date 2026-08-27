import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HorizontalCardRail } from '@/components/ui/horizontal-card-rail';

function mockSizes(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get() { return scrollWidth; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return clientWidth; },
  });
}

describe('HorizontalCardRail', () => {
  beforeEach(() => {
    (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  it('gradient nit se ne prikazuje kad sadržaj stane bez skrolanja', () => {
    mockSizes(300, 300);
    render(<HorizontalCardRail><div>a</div></HorizontalCardRail>);
    expect(screen.queryByTestId('rail-thread')).toBeNull();
  });

  it('gradient nit i strelica se prikazuju kad ima overflowa', () => {
    mockSizes(900, 300);
    render(<HorizontalCardRail><div>a</div></HorizontalCardRail>);
    expect(screen.getByTestId('rail-thread')).toBeTruthy();
    // desna strelica postoji, ali je skrivena na touch uređajima (hover media query)
    const next = screen.getByRole('button', { name: /desno|right|rechts/i });
    expect(next.className).toContain('[@media(hover:hover)]:flex');
    expect(next.className).toContain('hidden');
  });

  it('snap i skriveni scrollbar su prisutni na kontejneru', () => {
    mockSizes(900, 300);
    render(<HorizontalCardRail ariaLabel="rail"><div>a</div></HorizontalCardRail>);
    const scroller = screen.getByRole('group', { name: 'rail' });
    expect(scroller.className).toContain('snap-x');
    expect(scroller.className).toContain('scrollbar-hide');
    expect(scroller.getAttribute('tabindex')).toBe('0');
  });
});
