import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';

const PACKAGE = 'app.lovable.costbuddy';

/**
 * Build an Android `intent://` URL that explicitly targets the installed APK
 * by package name. This bypasses the browser's default handler picker and
 * prevents the OAuth callback from opening the PWA installed on the same
 * domain.
 *
 * Format:
 *   intent://auth/callback?code=...#Intent;scheme=app.lovable.costbuddy;package=app.lovable.costbuddy;end
 */
const buildIntentUrl = () => {
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return `intent://auth/callback${search}${hash}#Intent;scheme=${PACKAGE};package=${PACKAGE};end`;
};

const buildSchemeUrl = () =>
  `${PACKAGE}://auth/callback${window.location.search || ''}${window.location.hash || ''}`;

const NativeOAuthCallback = () => {
  const { t } = useTranslation();

  const openApp = () => {
    // Try the explicit intent first; fall back to plain scheme after a tick.
    window.location.href = buildIntentUrl();
    setTimeout(() => {
      window.location.href = buildSchemeUrl();
    }, 800);
  };

  useEffect(() => {
    // Auto-launch the APK as soon as the bridge page renders.
    window.location.href = buildIntentUrl();
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
