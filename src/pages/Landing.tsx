import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion, type Variants } from 'framer-motion';
import {
  Wallet, PieChart, TrendingUp, Users, Shield, Smartphone,
  Zap, BarChart3, Receipt, ArrowRight, Check, Star, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5 }
  })
};

const LandingNav = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">V&M Balance</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.features')}</a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.pricing')}</a>
          <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('landing.nav.testimonials')}</a>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
            {t('landing.nav.login')}
          </Button>
          <Button size="sm" onClick={() => navigate('/setup')} className="bg-gradient-to-r from-primary to-accent text-primary-foreground">
            {t('landing.nav.getStarted')}
          </Button>
        </div>
      </div>
    </nav>
  );
};

const HeroSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="pt-32 pb-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute top-40 right-10 w-96 h-96 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-income/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto text-center">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            {t('landing.hero.badge')}
          </span>
        </motion.div>

        <motion.h1
          className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-foreground leading-tight mb-6"
          initial="hidden" animate="visible" variants={fadeUp} custom={1}
        >
          {t('landing.hero.title')}{' '}
          <span className="bg-gradient-to-r from-primary via-accent to-income bg-clip-text text-transparent">
            {t('landing.hero.titleHighlight')}
          </span>
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          initial="hidden" animate="visible" variants={fadeUp} custom={2}
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial="hidden" animate="visible" variants={fadeUp} custom={3}
        >
          <Button size="lg" onClick={() => navigate('/setup')} className="bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 text-lg h-14 rounded-2xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow">
            {t('landing.hero.cta')}
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate('/install')} className="px-8 text-lg h-14 rounded-2xl">
            <Smartphone className="w-5 h-5 mr-2" />
            {t('landing.hero.installApp')}
          </Button>
        </motion.div>

        <motion.div
          className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground"
          initial="hidden" animate="visible" variants={fadeUp} custom={4}
        >
          <span className="flex items-center gap-1"><Check className="w-4 h-4 text-income" /> {t('landing.hero.free')}</span>
          <span className="flex items-center gap-1"><Shield className="w-4 h-4 text-primary" /> {t('landing.hero.secure')}</span>
          <span className="flex items-center gap-1"><Globe className="w-4 h-4 text-accent" /> {t('landing.hero.multilingual')}</span>
        </motion.div>
      </div>
    </section>
  );
};

const featuresList = [
  { icon: PieChart, colorClass: 'from-primary to-accent', key: 'tracking' },
  { icon: BarChart3, colorClass: 'from-accent to-income', key: 'reports' },
  { icon: Users, colorClass: 'from-income to-primary', key: 'family' },
  { icon: Wallet, colorClass: 'from-primary to-income', key: 'wallet' },
  { icon: Receipt, colorClass: 'from-accent to-primary', key: 'receipts' },
  { icon: TrendingUp, colorClass: 'from-income to-accent', key: 'budgets' },
];

const FeaturesSection = () => {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-24 px-4 bg-secondary/30">
      <div className="max-w-6xl mx-auto">
        <motion.div className="text-center mb-16" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.features.title')}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t('landing.features.subtitle')}</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuresList.map((f, i) => (
            <motion.div
              key={f.key}
              className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.colorClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{t(`landing.features.${f.key}.title`)}</h3>
              <p className="text-muted-foreground text-sm">{t(`landing.features.${f.key}.desc`)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const plans = [
  { key: 'free', popular: false },
  { key: 'pro', popular: true },
  { key: 'business', popular: false },
];

const PricingSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div className="text-center mb-16" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.pricing.title')}</h2>
          <p className="text-muted-foreground text-lg">{t('landing.pricing.subtitle')}</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.key}
              className={`relative p-6 rounded-2xl border ${plan.popular ? 'border-primary bg-gradient-to-b from-primary/5 to-accent/5 shadow-xl shadow-primary/10' : 'border-border bg-card'}`}
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
            >
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
                {[1, 2, 3, 4].map(n => {
                  const feat = t(`landing.pricing.${plan.key}.f${n}`, { defaultValue: '' });
                  if (!feat) return null;
                  return (
                    <li key={n} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-income shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  );
                })}
              </ul>
              <Button
                className={`w-full rounded-xl ${plan.popular ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground' : ''}`}
                variant={plan.popular ? 'default' : 'outline'}
                onClick={() => navigate('/setup')}
              >
                {t('landing.pricing.cta')}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const testimonialsList = [
  { key: 't1', stars: 5 },
  { key: 't2', stars: 5 },
  { key: 't3', stars: 4 },
];

const TestimonialsSection = () => {
  const { t } = useTranslation();

  return (
    <section id="testimonials" className="py-24 px-4 bg-secondary/30">
      <div className="max-w-5xl mx-auto">
        <motion.div className="text-center mb-16" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{t('landing.testimonials.title')}</h2>
          <p className="text-muted-foreground text-lg">{t('landing.testimonials.subtitle')}</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonialsList.map((test, i) => (
            <motion.div
              key={test.key}
              className="p-6 rounded-2xl bg-card border border-border/50"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
            >
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: test.stars }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-muted-foreground text-sm mb-4 italic">"{t(`landing.testimonials.${test.key}.text`)}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-sm">
                  {t(`landing.testimonials.${test.key}.name`).charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t(`landing.testimonials.${test.key}.name`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`landing.testimonials.${test.key}.role`)}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const FooterSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <footer className="py-16 px-4 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Wallet className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">V&M Balance</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('landing.footer.desc')}</p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">{t('landing.footer.product')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">{t('landing.nav.features')}</a></li>
              <li><a href="#pricing" className="hover:text-foreground transition-colors">{t('landing.nav.pricing')}</a></li>
              <li><button onClick={() => navigate('/install')} className="hover:text-foreground transition-colors">{t('landing.hero.installApp')}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">{t('landing.footer.legal')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/privacy-policy')} className="hover:text-foreground transition-colors">{t('landing.footer.privacy')}</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3">{t('landing.footer.account')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">{t('landing.nav.login')}</button></li>
              <li><button onClick={() => navigate('/setup')} className="hover:text-foreground transition-colors">{t('landing.nav.getStarted')}</button></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} V&M Balance. {t('landing.footer.rights')}
        </div>
      </div>
    </footer>
  );
};

const Landing = () => {
  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection />
      <FooterSection />
    </div>
  );
};

export default Landing;
