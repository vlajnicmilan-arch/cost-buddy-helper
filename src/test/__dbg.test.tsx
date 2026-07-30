import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as D from '@radix-ui/react-dropdown-menu';
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
describe('x', () => {
  it('opens', async () => {
    render(<D.Root><D.Trigger aria-label="more">x</D.Trigger><D.Portal><D.Content><D.Item>ITEM</D.Item></D.Content></D.Portal></D.Root>);
    fireEvent.pointerDown(screen.getByLabelText('more'), { button: 0, ctrlKey: false, pointerType: 'touch' });
    console.log(document.body.innerHTML.slice(0,400));
    await screen.findByText('ITEM');
  });
});
