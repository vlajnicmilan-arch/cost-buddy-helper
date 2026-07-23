import { describe, it, expect, vi, beforeEach } from 'vitest';

const openMock = vi.fn();

vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: vi.fn(async () => ({
    Checkout: { open: openMock },
  })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({
        data: { token: 'test_token', environment: 'sandbox', configured: true },
        error: null,
      })),
    },
  },
}));

beforeEach(() => {
  openMock.mockClear();
  vi.resetModules();
});

describe('openPaddleCheckout — discountCode', () => {
  it('forwards discountCode to Paddle.Checkout.open when provided', async () => {
    const { openPaddleCheckout } = await import('@/lib/paddleClient');
    const ok = await openPaddleCheckout({
      priceId: 'pri_123',
      userId: 'u1',
      discountCode: 'FOUNDING100',
    });
    expect(ok).toBe(true);
    expect(openMock).toHaveBeenCalledTimes(1);
    const arg = openMock.mock.calls[0][0];
    expect(arg.discountCode).toBe('FOUNDING100');
    expect(arg.customData).toEqual({ user_id: 'u1' });
  });

  it('omits discountCode entirely when not provided (backward-compatible)', async () => {
    const { openPaddleCheckout } = await import('@/lib/paddleClient');
    await openPaddleCheckout({ priceId: 'pri_123', userId: 'u1' });
    const arg = openMock.mock.calls[0][0];
    expect('discountCode' in arg).toBe(false);
  });

  it('trims whitespace around the discount code', async () => {
    const { openPaddleCheckout } = await import('@/lib/paddleClient');
    await openPaddleCheckout({
      priceId: 'pri_123',
      userId: 'u1',
      discountCode: '  FOUNDING100  ',
    });
    expect(openMock.mock.calls[0][0].discountCode).toBe('FOUNDING100');
  });

  it('omits discountCode when the value is empty/whitespace only', async () => {
    const { openPaddleCheckout } = await import('@/lib/paddleClient');
    await openPaddleCheckout({
      priceId: 'pri_123',
      userId: 'u1',
      discountCode: '   ',
    });
    expect('discountCode' in openMock.mock.calls[0][0]).toBe(false);
  });
});
