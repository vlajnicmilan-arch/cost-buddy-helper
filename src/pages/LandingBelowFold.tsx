import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Wallet, PieChart, TrendingUp, Users, BarChart3, Receipt, Check, Star, Crown, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import cardsImage from '@/assets/cards-floating.webp';
import mockupDashboard from '@/assets/app-mockup-dashboard.webp';
import mockupBudget from '@/assets/app-mockup-budget.webp';

type TFn = (key: string) => string;

interface LandingBelowFoldProps {
  t: TFn;
  goToSignup: () => void;
}

const featureItems: Array<{ icon: LucideIcon; colorClass: string; key: string }> = [
  { icon: PieChart, colorClass: 'from-primary to-accent', key: 'tracking' },
  { icon: BarChart3, colorClass: 'from-accent to-income', key: 'reports' },
  { icon: Users, colorClass: 'from-income to-primary', key: 'family' },
  { icon: Wallet, colorClass: 'from-primary to-income', key: 'wallet' },
  { icon: Receipt, colorClass: 'from-accent to-primary', key: 'receipts' },
  { icon: TrendingUp, colorClass: 'from-income to-accent', key: 'budgets' },
];

const plans = [
  { key: 'free', popular: false },
  { key: 'pro', popular: true },
  { key: 'business', popular: false },
];

const testimonials = [
  { key: 't1', stars: 5 },
  { key: 't2', stars: 5 },
  { key: 't3', stars: 4 },
];

export const LandingBelowFold = ({ t, goToSignup }: LandingBelowFoldProps) => {
  const [lifetime, setLifetime] = useState<{ remaining: number; sold: number; max: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('get-lifetime-availability');
        if (alive && data && typeof data.remaining === 'number') {
          setLifetime({
            remaining: data.remaining,
            sold: data.sold ?? 0,
            max: data.max ?? data.total ?? 200,
          });
        }
      } catch (err) {
        console.warn('Lifetime availability fetch failed:', err);
      }
    })();
    return () => { alive = false; };
  }, []);

  const lifetimeSoldOut = lifetime?.remaining === 0;
  const remainingLabel = lifetime
    ? t('landing.pricing.lifetime.remaining').replace('{n}', String(lifetime.remaining))
    : '';

  return (
  <>
    <section className="py-20 px-4 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.showcase.title')}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t('landing.showcase.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
          <img src={mockupDashboard} alt={t('alt.dashboard')} className="w-52 sm:w-64 h-auto drop-shadow-2xl" loading="lazy" decoding="async" />
          <img src={mockupBudget} alt={t('alt.budget')} className="w-52 sm:w-64 h-auto drop-shadow-2xl" loading="lazy" decoding="async" />
        </div>
        <div className="mt-12 flex justify-center">
          <img src={cardsImage} alt={t('alt.cards')} className="w-64 sm:w-80 h-auto rounded-2xl" loading="lazy" decoding="async" />
        </div>
      </div>
    </section>

    <section id="features" className="py-24 px-4 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.features.title')}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t('landing.features.subtitle')}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureItems.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.key} className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.colorClass} flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{t(`landing.features.${feature.key}.title`)}</h3>
                <p className="text-muted-foreground text-sm">{t(`landing.features.${feature.key}.desc`)}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section id="pricing" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.pricing.title')}</h2>
          <p className="text-muted-foreground text-lg">{t('landing.pricing.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <article key={plan.key} className={`relative p-6 rounded-2xl border ${plan.popular ? 'border-primary bg-gradient-to-b from-primary/5 to-accent/5 shadow-xl shadow-primary/10' : 'border-border bg-card'}`}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-bold">
                  {t('landing.pricing.popular')}
                </span>
              )}
              <h3 className="text-xl font-bold text-foreground mb-1">{t(`landing.pricing.${plan.key}.name`)}</h3>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-foreground">{t(`landing.pricing.${plan.key}.price`)}</span>
                <span className="text-muted-foreground text-sm">/{t('landing.pricing.month')}</span>
              </div>
              <ul className="space-y-3 mb-6">
                {[1, 2, 3, 4].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-income shrink-0 mt-0.5" />
                    {t(`landing.pricing.${plan.key}.f${item}`)}
                  </li>
                ))}
              </ul>
              <button type="button" className={`w-full inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${plan.popular ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95' : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'}`} onClick={goToSignup}>
                {t('landing.pricing.cta')}
              </button>
            </article>
          ))}
        </div>

        {/* ====== Pro Lifetime — Founding Members banner ====== */}
        <div className="mt-10">
          <article className="relative overflow-hidden rounded-3xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-50/80 via-card to-card dark:from-amber-950/30 dark:via-card dark:to-card p-8 md:p-10 shadow-2xl shadow-amber-500/10">
            <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full bg-gradient-to-br from-amber-400/30 to-amber-600/10 blur-3xl" aria-hidden="true" />

            <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold mb-4">
                  <Sparkles className="w-3 h-3" />
                  {t('landing.pricing.lifetime.badge')}
                </span>

                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold text-foreground">{t('landing.pricing.lifetime.name')}</h3>
                    <p className="text-sm text-muted-foreground">{t('landing.pricing.lifetime.tagline')}</p>
                  </div>
                </div>

                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mb-4">
                  💡 {t('landing.pricing.lifetime.discount')}
                </p>

                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-5">
                  {[1, 2, 3, 4].map((i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      {t(`landing.pricing.lifetime.f${i}`)}
                    </li>
                  ))}
                </ul>

                {lifetime && (
                  <div className="max-w-md">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-foreground">
                        {lifetimeSoldOut ? t('landing.pricing.lifetime.soldOut') : remainingLabel}
                      </span>
                      <span className="text-muted-foreground">{lifetime.sold} / {lifetime.max}</span>
                    </div>
                    <div className="h-2 rounded-full bg-amber-500/15 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-700"
                        style={{ width: `${Math.min(100, (lifetime.sold / lifetime.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center md:text-right md:border-l md:border-amber-500/20 md:pl-8 shrink-0">
                <div className="mb-4">
                  <div className="text-5xl md:text-6xl font-extrabold text-foreground tracking-tight">
                    {t('landing.pricing.lifetime.price')}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{t('landing.pricing.lifetime.oneTime')}</div>
                </div>
                <button
                  type="button"
                  onClick={goToSignup}
                  disabled={lifetimeSoldOut}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition-all bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none w-full md:w-auto"
                >
                  {lifetimeSoldOut ? t('landing.pricing.lifetime.soldOut') : t('landing.pricing.lifetime.cta')}
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section id="testimonials" className="py-24 px-4 bg-secondary/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.testimonials.title')}</h2>
          <p className="text-muted-foreground text-lg">{t('landing.testimonials.subtitle')}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <article key={testimonial.key} className="p-6 rounded-2xl bg-card border border-border/50">
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: testimonial.stars }).map((_, index) => (
                  <Star key={index} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-muted-foreground text-sm mb-4 italic">&quot;{t(`landing.testimonials.${testimonial.key}.text`)}&quot;</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                  {t(`landing.testimonials.${testimonial.key}.name`).charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t(`landing.testimonials.${testimonial.key}.name`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`landing.testimonials.${testimonial.key}.role`)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  </>
);
