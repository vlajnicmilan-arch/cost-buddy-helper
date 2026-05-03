import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';

const NATIVE_CALLBACK = 'app.lovable.costbuddy://auth/callback';
const ANDROID_PACKAGE = 'app.lovable.costbuddy';

const buildNativeUrl = () => `${NATIVE_CALLBACK}${window.location.search || ''}${window.location.hash || ''}`;

const buildAndroidIntentUrl = () => {
  const query = window.location.search || '';
  const hash = window.location.hash || '';
  return `intent://auth/callback${query}${hash}#Intent;scheme=app.lovable.costbuddy;package=${ANDROID_PACKAGE};end`;
};

const NativeOAuthCallback = () => {
  const { t } = useTranslation();
  const isAndroid = useMemo(() => /android/i.test(navigator.userAgent || ''), []);

  const openApp = () => {
    window.location.href = isAndroid ? buildAndroidIntentUrl() : buildNativeUrl();
  };

  useEffect(() => {
    window.location.href = buildNativeUrl();
  }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground flex items-center justify-center px-6">
      <section className="w-full max-w-sm text-center space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t('auth.nativeOAuth.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.nativeOAuth.description')}</p>
        </div>
        <button
          type="button"
          onClick={openApp}
          className="min-h-11 w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t('auth.nativeOAuth.openApp')}
          </span>
        </button>
        <p className="text-xs text-muted-foreground">{t('auth.nativeOAuth.help')}</p>
      </section>
    </main>
  );
};

export default NativeOAuthCallback;