import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPriceMapEnv } from '@/lib/paddleClient';

export type PaddleModule = 'smjer' | 'krug' | 'projekti' | 'biznis';
export type BillingCycle = 'monthly' | 'yearly';

export interface PaddlePriceRow {
  price_id: string;
  module: string;
  billing_cycle: string;
  environment: string;
  notes: string | null;
}

/**
 * Resolves a single price_id for a given plan + billing cycle.
 * Plans:
 *   - `smjer` / `krug` / `projekti` → the module's own single-module price
 *     (the row whose price_id maps to exactly ONE module).
 *   - `komplet` → the bundle price that maps to smjer + krug + projekti
 *     (the row whose price_id appears against all three).
 */
export type PaywallPlan = 'smjer' | 'krug' | 'projekti' | 'komplet';

export interface ResolvedPrices {
  loading: boolean;
  error: string | null;
  /** plan → cycle → price_id */
  prices: Record<PaywallPlan, Partial<Record<BillingCycle, string>>>;
}

export const usePaddlePrices = (): ResolvedPrices => {
  const [state, setState] = useState<ResolvedPrices>({
    loading: true,
    error: null,
    prices: { smjer: {}, krug: {}, projekti: {}, komplet: {} },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const env = await getPriceMapEnv();
      if (cancelled) return;
      const { data, error } = await supabase
        .from('paddle_price_map')
        .select('price_id, module, billing_cycle, environment, notes')
        .eq('environment', env);
      if (cancelled) return;
      if (error) {
        setState({
          loading: false,
          error: error.message,
          prices: { smjer: {}, krug: {}, projekti: {}, komplet: {} },
        });
        return;
      }
      const rows = (data ?? []) as PaddlePriceRow[];
      // Count modules per price_id to detect bundle vs single.
      const modulesByPrice = new Map<string, Set<string>>();
      const cycleByPrice = new Map<string, string>();
      for (const r of rows) {
        if (!modulesByPrice.has(r.price_id)) modulesByPrice.set(r.price_id, new Set());
        modulesByPrice.get(r.price_id)!.add(r.module);
        cycleByPrice.set(r.price_id, r.billing_cycle);
      }
      const prices: ResolvedPrices['prices'] = {
        smjer: {},
        krug: {},
        projekti: {},
        komplet: {},
      };
      for (const [priceId, mods] of modulesByPrice.entries()) {
        const cycle = cycleByPrice.get(priceId) as BillingCycle | undefined;
        if (cycle !== 'monthly' && cycle !== 'yearly') continue;
        const bundleModules = new Set(['smjer', 'krug', 'projekti']);
        const isBundle =
          mods.size >= 3 &&
          [...bundleModules].every((m) => mods.has(m));
        if (isBundle) {
          prices.komplet[cycle] = priceId;
        } else if (mods.size === 1) {
          const only = [...mods][0] as PaywallPlan;
          if (only in prices) prices[only][cycle] = priceId;
        }
      }
      setState({ loading: false, error: null, prices });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
