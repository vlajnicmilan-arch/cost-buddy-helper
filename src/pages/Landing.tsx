import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Zap, Shield, Smartphone, ArrowRight, Check, Globe, Menu, X, Download } from 'lucide-react';
import logo from '@/assets/logo.webp';
import { getInitialLandingLanguage, getLandingTranslation, landingLanguages, type LandingLanguage } from './landingTranslations';

const LandingBelowFold = lazy(() => import('./LandingBelowFold').then((module) => ({ default: module.LandingBelowFold })));

const goTo = (path: string) => {
  window.location.href = path;
};

const goToSignup = () => {
  window.location.href = '/auth?mode=signup';
};

const getApkUrl = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const cacheBust = Math.floor(Date.now() / (5 * 60 * 1000));
  return `${supabaseUrl}/storage/v1/object/public/public-assets/vm-balance.apk?download=vm-balance.apk&v=${cacheBust}`;
};

const LanguageSelector = ({ language, setLanguage, t }: { language: LandingLanguage; setLanguage: (language: LandingLanguage) => void; t: (key: string) => string }) => {
  const [open, setOpen] = useState(false);
  const flags: Record<LandingLanguage, string> = { hr: '🇭🇷', en: '🇬🇧', de: '🇩🇪' };

  const selectLanguage = (nextLanguage: LandingLanguage) => {
    localStorage.setItem('i18nextLng', nextLanguage);
    setLanguage(nextLanguage);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-lg transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('language.label')}
        aria-expanded={open}
      >
        {flags[language]}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[60] w-40 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {landingLanguages.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => selectLanguage(item)}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-popover-foreground hover:bg-accent"
            >
              <span className="text-lg">{flags[item]}</span>
              <span className="flex-1">{t(`language.${item}`)}</span>
              {language === item && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const LandingNav = ({ language, setLanguage, t }: { language: LandingLanguage; setLanguage: (language: LandingLanguage) => void; t: (key: string) => string }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex min-h-11 items-center gap-2" aria-label="V&M Balance">
          <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-xl">
            <img src={logo} alt={t('alt.logo')} className="h-full w-full scale-[1.8] object-cover" width="36" height="36" decoding="async" />
          </span>
          <span className="text-xl font-bold text-foreground">V&M Balance</span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('landing.nav.features')}</a>
          <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('landing.nav.pricing')}</a>
          <a href="#testimonials" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('landing.nav.testimonials')}</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSelector language={language} setLanguage={setLanguage} t={t} />
          <button type="button" onClick={() => goTo('/auth')} className="hidden min-h-11 items-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex">
            {t('landing.nav.login')}
          </button>
          <button type="button" onClick={goToSignup} className="hidden min-h-11 items-center rounded-md bg-gradient-to-r from-primary to-accent px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95 sm:inline-flex">
            {t('landing.nav.getStarted')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            onClick={() => setMobileMenuOpen((current) => !current)}
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background px-4 py-4 md:hidden">
          <div className="space-y-2">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block min-h-11 py-3 text-sm text-muted-foreground hover:text-foreground">{t('landing.nav.features')}</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block min-h-11 py-3 text-sm text-muted-foreground hover:text-foreground">{t('landing.nav.pricing')}</a>
            <a href="#testimonials" onClick={() => setMobileMenuOpen(false)} className="block min-h-11 py-3 text-sm text-muted-foreground hover:text-foreground">{t('landing.nav.testimonials')}</a>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="min-h-11 flex-1 rounded-md border border-input px-3 text-sm font-medium" onClick={() => { setMobileMenuOpen(false); goTo('/auth'); }}>
              {t('landing.nav.login')}
            </button>
            <button type="button" className="min-h-11 flex-1 rounded-md bg-gradient-to-r from-primary to-accent px-3 text-sm font-medium text-primary-foreground" onClick={() => { setMobileMenuOpen(false); goToSignup(); }}>
              {t('landing.nav.getStarted')}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

const HeroSection = ({ t }: { t: (key: string) => string }) => (
  <section className="relative overflow-hidden px-4 pb-20 pt-28">
    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background" />
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div>
        <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Zap className="h-4 w-4" />
          {t('landing.hero.badge')}
        </span>
        <h1 className="mb-6 text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl">
          {t('landing.hero.title')}{' '}
          <span className="bg-gradient-to-r from-primary via-accent to-income bg-clip-text text-transparent">
            {t('landing.hero.titleHighlight')}
          </span>
        </h1>
        <p className="mb-8 max-w-lg text-lg text-muted-foreground">{t('landing.hero.subtitle')}</p>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <button type="button" onClick={goToSignup} className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-primary to-accent px-8 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl hover:shadow-primary/30">
            {t('landing.hero.cta')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
          <button type="button" onClick={() => goTo('/install')} className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-input bg-background px-8 text-lg font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
            <Smartphone className="mr-2 h-5 w-5" />
            {t('landing.hero.installApp')}
          </button>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted-foreground sm:gap-6">
          <span className="flex items-center gap-1"><Check className="h-4 w-4 text-income" /> {t('landing.hero.free')}</span>
          <span className="flex items-center gap-1"><Shield className="h-4 w-4 text-primary" /> {t('landing.hero.secure')}</span>
          <span className="flex items-center gap-1"><Globe className="h-4 w-4 text-accent" /> {t('landing.hero.multilingual')}</span>
        </div>
      </div>
      <div className="relative hidden lg:block">
        <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-primary/20">
          <picture>
            <source media="(min-width: 1024px)" srcSet="/hero-receipt-scan.webp" type="image/webp" />
            <img src="/hero-receipt-scan-mobile.webp" alt={t('alt.hero')} className="h-auto w-full object-cover" width="1024" height="1024" fetchPriority="high" decoding="async" />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
        </div>
      </div>
    </div>
    <div className="mt-10 flex justify-center lg:hidden">
      <div className="max-w-sm overflow-hidden rounded-2xl shadow-xl">
        <img src="/hero-receipt-scan-mobile.webp" alt={t('alt.hero')} className="h-auto w-full object-cover" width="640" height="640" fetchPriority="high" decoding="async" />
      </div>
    </div>
  </section>
);

const FooterSection = ({ t }: { t: (key: string) => string }) => (
  <footer className="border-t border-border px-4 py-16">
    <div className="mx-auto max-w-6xl">
      <div className="mb-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg">
              <img src={logo} alt={t('alt.logo')} className="h-full w-full scale-[1.8] object-cover" loading="lazy" decoding="async" />
            </div>
            <span className="font-bold text-foreground">V&M Balance</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('landing.footer.desc')}</p>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-foreground">{t('landing.footer.product')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="#features" className="hover:text-foreground">{t('landing.nav.features')}</a></li>
            <li><a href="#pricing" className="hover:text-foreground">{t('landing.nav.pricing')}</a></li>
            <li><button type="button" onClick={() => goTo('/install')} className="hover:text-foreground">{t('landing.hero.installApp')}</button></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-foreground">{t('landing.footer.legal')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><button type="button" onClick={() => goTo('/privacy-policy')} className="hover:text-foreground">{t('landing.footer.privacy')}</button></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-foreground">{t('landing.footer.account')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><button type="button" onClick={() => goTo('/auth')} className="hover:text-foreground">{t('landing.nav.login')}</button></li>
            <li><button type="button" onClick={goToSignup} className="hover:text-foreground">{t('landing.nav.getStarted')}</button></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} V&M Balance. {t('landing.footer.rights')}
      </div>
    </div>
  </footer>
);

const APKDownloadSection = ({ referralCode, t }: { referralCode: string; t: (key: string) => string }) => (
  <section className="relative overflow-hidden px-4 pb-16 pt-28">
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-6 h-20 w-20 overflow-hidden rounded-3xl shadow-lg shadow-primary/25">
        <img src={logo} alt={t('alt.logo')} className="h-full w-full scale-[1.8] object-cover" width="80" height="80" decoding="async" />
      </div>
      <h1 className="mb-4 text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">{t('landing.apk.title')}</h1>
      <p className="mb-8 text-lg text-muted-foreground">{t('landing.apk.subtitle')}</p>
      <div className="space-y-4">
        <button type="button" onClick={() => window.open(getApkUrl(), '_blank', 'noopener,noreferrer')} className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-accent px-8 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl hover:shadow-primary/30">
          <Download className="h-6 w-6" />
          {t('landing.apk.download')}
        </button>
        <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-left">
          <p className="text-sm font-medium text-foreground">{t('landing.apk.instructions')}</p>
          <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>{t('landing.apk.step1')}</li>
            <li>{t('landing.apk.step2')}</li>
            <li>{t('landing.apk.step3')}</li>
            <li>{t('landing.apk.step4')}</li>
          </ol>
        </div>
        <div className="rounded-xl bg-accent/10 p-4 text-center">
          <p className="mb-1 text-sm text-muted-foreground">{t('landing.apk.referralLabel')}</p>
          <p className="select-all font-mono text-2xl font-bold tracking-wider text-foreground">{referralCode.slice(0, 8).toUpperCase()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('landing.apk.referralHint')}</p>
        </div>
      </div>
      <div className="mt-8 border-t border-border pt-6">
        <p className="mb-3 text-sm text-muted-foreground">{t('landing.apk.webOption')}</p>
        <button type="button" onClick={goToSignup} className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
          {t('landing.nav.getStarted')}
        </button>
      </div>
    </div>
  </section>
);

const useDeferredBelowFold = () => {
  const [showBelowFold, setShowBelowFold] = useState(false);

  useEffect(() => {
    const reveal = () => setShowBelowFold(true);
    const onFirstScroll = () => reveal();
    window.addEventListener('scroll', onFirstScroll, { once: true, passive: true });

    const idleId = 'requestIdleCallback' in window
      ? window.requestIdleCallback(reveal, { timeout: 2500 })
      : window.setTimeout(reveal, 1800);

    return () => {
      window.removeEventListener('scroll', onFirstScroll);
      if ('cancelIdleCallback' in window && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId as number);
      }
    };
  }, []);

  return showBelowFold;
};

const Landing = () => {
  const [language, setLanguage] = useState<LandingLanguage>(() => getInitialLandingLanguage());
  const [referralId, setReferralId] = useState<string | null>(null);
  const showBelowFold = useDeferredBelowFold();
  const t = useCallback((key: string) => getLandingTranslation(language, key), [language]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('referrer_id', ref);
      setReferralId(ref);
    }
  }, []);

  if (referralId) {
    return (
      <div className="min-h-dvh bg-background">
        <LandingNav language={language} setLanguage={setLanguage} t={t} />
        <APKDownloadSection referralCode={referralId} t={t} />
        <FooterSection t={t} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <LandingNav language={language} setLanguage={setLanguage} t={t} />
      <HeroSection t={t} />
      {showBelowFold ? (
        <Suspense fallback={<div className="min-h-[520px]" />}>
          <LandingBelowFold t={t} goToSignup={goToSignup} />
        </Suspense>
      ) : (
        <div className="min-h-[520px]" aria-hidden="true" />
      )}
      <FooterSection t={t} />
    </div>
  );
};

export default Landing;
