import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: vi.fn() }));

beforeAll(() => {
  // jsdom lacks the pointer capture APIs Radix touches.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const Harness = ({
  onSelect,
  onOpenChange,
}: {
  onSelect: () => void;
  onOpenChange?: (open: boolean) => void;
}) => (
  <DropdownMenu onOpenChange={onOpenChange}>
    <DropdownMenuTrigger aria-label="more">⋯</DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={onSelect}>Prikaži na dashboardu</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const openMenu = (pointerType: string) => {
  const trigger = screen.getByLabelText('more');
  fireEvent.pointerDown(trigger, { pointerType, button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { pointerType });
  fireEvent.click(trigger, { detail: 1 });
};

describe('dropdown-menu touch guard (open-anchored)', () => {
  it('suppresses the ghost click that follows the opening tap (stale mount scenario)', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    openMenu('touch');
    const item = await screen.findByText('Prikaži na dashboardu');

    // Ghost click: no pointerdown and no pointerup inside the content.
    fireEvent.click(item, { detail: 0 });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('allows a deliberate tap that starts inside the content', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    openMenu('touch');
    const item = await screen.findByText('Prikaži na dashboardu');

    fireEvent.pointerDown(item, { pointerType: 'touch' });
    fireEvent.pointerUp(item, { pointerType: 'touch' });
    fireEvent.click(item, { detail: 1 });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('allows a slow deliberate click after the guard window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);

      openMenu('touch');
      const item = await screen.findByText('Prikaži na dashboardu');

      vi.advanceTimersByTime(1500);
      fireEvent.click(item, { detail: 1 });

      expect(onSelect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps mouse press-drag-release working', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    openMenu('mouse');
    const item = await screen.findByText('Prikaži na dashboardu');

    fireEvent.pointerUp(item, { pointerType: 'mouse' });
    fireEvent.click(item, { detail: 1 });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('still calls the consumer onOpenChange (composition)', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onSelect={vi.fn()} onOpenChange={onOpenChange} />);

    openMenu('touch');
    await screen.findByText('Prikaži na dashboardu');

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
