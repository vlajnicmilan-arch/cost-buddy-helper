import type { LucideIcon } from 'lucide-react';
import { Wallet, PieChart, TrendingUp, Users, BarChart3, Receipt, Check, Star } from 'lucide-react';
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

export const LandingBelowFold = ({ t, goToSignup }: LandingBelowFoldProps) => (
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
