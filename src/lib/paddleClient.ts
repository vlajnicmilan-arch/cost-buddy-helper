/**
 * Paddle.js client wrapper.
 * - Environment is auto-detected from the client token prefix
 *   (`test_...` → sandbox, `live_...` → production).
 * - Optional `VITE_PADDLE_ENV` env var forces a specific environment.
 * - Uses @paddle/paddle-js (npm) so bundling + type safety is deterministic.
 */
import { initializePaddle, type Paddle, type Environments } from '@paddle/paddle-js';

let paddlePromise: Promise<Paddle | undefined> | null = null;

export type PaddleEnv = Extract<Environments, 'sandbox' | 'production'>;

export const getPaddleEnv = (): PaddleEnv => {
  const forced = (import.meta.env.VITE_PADDLE_ENV as string | undefined)?.toLowerCase();
  if (forced === 'sandbox' || forced === 'production') return forced;
  const token = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined) || '';
  if (token.startsWith('test_')) return 'sandbox';
  return 'production';
};

/**
 * The environment string the paddle_price_map table uses.
 * (`sandbox` | `live`)
 */
export const getPriceMapEnv = (): 'sandbox' | 'live' =>
  getPaddleEnv() === 'sandbox' ? 'sandbox' : 'live';

export const getPaddle = (): Promise<Paddle | undefined> => {
  if (paddlePromise) return paddlePromise;
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
  if (!token) {
    console.error(
      '[paddleClient] VITE_PADDLE_CLIENT_TOKEN is not set. Checkout will not open.'
    );
    paddlePromise = Promise.resolve(undefined);
    return paddlePromise;
  }
  paddlePromise = initializePaddle({
    environment: getPaddleEnv(),
    token,
  }).catch((err) => {
    console.error('[paddleClient] initializePaddle failed:', err);
    paddlePromise = null;
    return undefined;
  });
  return paddlePromise;
};

export interface OpenCheckoutArgs {
  priceId: string;
  userId: string;
  email?: string | null;
  locale?: 'hr' | 'en' | 'de';
  successUrl?: string;
}

/**
 * Opens the Paddle overlay checkout with `custom_data.user_id` attached.
 * Paddle copies custom_data from the transaction into the subscription
 * webhook payload, which is how paddle-webhook resolves the user.
 */
export const openPaddleCheckout = async (args: OpenCheckoutArgs): Promise<boolean> => {
  const paddle = await getPaddle();
  if (!paddle) return false;
  paddle.Checkout.open({
    items: [{ priceId: args.priceId, quantity: 1 }],
    customData: { user_id: args.userId },
    customer: args.email ? { email: args.email } : undefined,
    settings: {
      locale: args.locale ?? 'hr',
      successUrl:
        args.successUrl ??
        `${window.location.origin}/app?checkout=success`,
      displayMode: 'overlay',
      theme: 'light',
      allowLogout: false,
    },
  });
  return true;
};
