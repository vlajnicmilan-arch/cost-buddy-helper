import type { PaywallPlan } from '@/lib/paywallGate';

/**
 * JEDINI izvor istine za sticker cijene (prikaz).
 * Stvarni `price_id` i naplata i dalje idu preko `paddle_price_map`.
 *
 * Landing (`CentarLanding.body*.html`) je statički HTML i ne može uvesti ovu
 * konstantu — usklađenost čuva `src/test/pricingSingleSource.test.ts`.
 */
export interface StickerPrice {
  monthly: number;
  yearly: number;
}

export const STICKER_PRICES: Record<PaywallPlan, StickerPrice> = {
  smjer: { monthly: 5.99, yearly: 59.9 },
  krug: { monthly: 9.99, yearly: 99.9 },
  projekti: { monthly: 21.99, yearly: 219.9 },
  komplet: { monthly: 25.99, yearly: 259.9 },
};

export const PLAN_ORDER: PaywallPlan[] = ['smjer', 'krug', 'projekti', 'komplet'];
