/**
 * Paddle.js client wrapper.
 *
 * The client token + environment are fetched from the `get-paddle-config`
 * edge function (which reads the `PADDLE_CLIENT_TOKEN` runtime secret) so
 * that no Paddle credentials have to live in a committed `.env`.
 *
 * Environment resolution order:
 *   1. `PADDLE_ENV` runtime secret (`sandbox` | `production`) if set.
 *   2. Token prefix (`test_...` → sandbox, otherwise production).
 */
import { initializePaddle, type Paddle, type Environments } from '@paddle/paddle-js';
import { supabase } from '@/integrations/supabase/client';

export type PaddleEnv = Extract<Environments, 'sandbox' | 'production'>;

interface PaddleConfig {
  token: string;
  environment: PaddleEnv;
  configured: boolean;
}

let configPromise: Promise<PaddleConfig> | null = null;
let paddlePromise: Promise<Paddle | undefined> | null = null;

const fetchConfig = (): Promise<PaddleConfig> => {
  if (configPromise) return configPromise;
  configPromise = (async (): Promise<PaddleConfig> => {
    const { data, error } = await supabase.functions.invoke('get-paddle-config');
    if (error || !data) {
      console.error('[paddleClient] get-paddle-config failed:', error);
      return { token: '', environment: 'production' as PaddleEnv, configured: false };
    }
    const env: PaddleEnv = (data as { environment?: string }).environment === 'sandbox'
      ? 'sandbox'
      : 'production';
    return {
      token: String((data as { token?: string }).token ?? ''),
      environment: env,
      configured: Boolean((data as { configured?: boolean }).configured),
    };
  })().catch((err): PaddleConfig => {
    console.error('[paddleClient] fetchConfig threw:', err);
    configPromise = null;
    return { token: '', environment: 'production' as PaddleEnv, configured: false };
  });
  return configPromise;
};

export const getPaddleEnv = async (): Promise<PaddleEnv> =>
  (await fetchConfig()).environment;

/**
 * Environment string used by the `paddle_price_map` table (`sandbox` | `live`).
 */
export const getPriceMapEnv = async (): Promise<'sandbox' | 'live'> =>
  (await getPaddleEnv()) === 'sandbox' ? 'sandbox' : 'live';

export const getPaddle = (): Promise<Paddle | undefined> => {
  if (paddlePromise) return paddlePromise;
  paddlePromise = (async () => {
    const cfg = await fetchConfig();
    if (!cfg.configured || !cfg.token) {
      console.error(
        '[paddleClient] PADDLE_CLIENT_TOKEN is not configured. Checkout will not open.'
      );
      return undefined;
    }
    return initializePaddle({
      environment: cfg.environment,
      token: cfg.token,
    });
  })().catch((err) => {
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
