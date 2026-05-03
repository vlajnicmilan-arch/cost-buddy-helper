import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { supabase } from '@/integrations/supabase/client';

const PACKAGE = 'app.lovable.costbuddy';
const NATIVE_OAUTH_PAYLOAD_KEY = 'vmb-native-oauth-callback-payload';

/**
 * Build the payload that must reach the APK. Supabase may return either:
 *   - PKCE: ?code=...&state=... in the search string
 *   - Implicit: #access_token=...&refresh_token=...&...&token_type=bearer in the hash
 *
 * Android `intent://` URLs only allow a single `#Intent;...;end` fragment, so
 * we must NOT pass through a separate `#access_token=...` hash — it would be
 * eaten by the intent parser. Instead we merge hash params into the query
 * string so the deep link arrives in the APK as
 *   app.lovable.costbuddy://auth/callback?access_token=...&refresh_token=...
 */
const buildPayloadQuery = () => {
  const params = new URLSearchParams();

  let savedPayload = '';
  try {
    savedPayload = sessionStorage.getItem(NATIVE_OAUTH_PAYLOAD_KEY) || '';
  } catch {
    savedPayload = '';
  }

  const [savedSearch, savedHash] = savedPayload.split('#');

  if (savedSearch?.startsWith('?')) {
    const sp = new URLSearchParams(savedSearch.slice(1));
    sp.forEach((v, k) => params.set(k, v));
  }

  if (savedHash) {
    const hp = new URLSearchParams(savedHash);
    hp.forEach((v, k) => params.set(k, v));
  }

  const search = window.location.search || '';
  if (search.startsWith('?')) {
    const sp = new URLSearchParams(search.slice(1));
    sp.forEach((v, k) => params.set(k, v));
  }

  const hash = (window.location.hash || '').replace(/^#/, '');
  if (hash) {
    const hp = new URLSearchParams(hash);
    hp.forEach((v, k) => params.set(k, v));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const hasOAuthPayload = (query: string) => {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  return params.has('code') || params.has('access_token') || params.has('refresh_token') || params.has('error') || params.has('error_description');
};

const resolvePayloadQuery = async () => {
  const query = buildPayloadQuery();
  if (hasOAuthPayload(query)) return query;

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token || !session.refresh_token) return query;

  const params = new URLSearchParams();
  params.set('access_token', session.access_token);
  params.set('refresh_token', session.refresh_token);
  params.set('token_type', session.token_type || 'bearer');
  logDiagnostic('native_oauth_bridge_session_payload', { hasSession: true });
  return `?${params.toString()}`;
};

const buildIntentUrl = (query: string) => {
  return `intent://auth/callback${query}#Intent;scheme=${PACKAGE};package=${PACKAGE};end`;
};

const buildSchemeUrl = (query: string) => {
  return `${PACKAGE}://auth/callback${query}`;
};

const NativeOAuthCallback = () => {
  const { t } = useTranslation();

  const callbackKind = useMemo(() => {
    const search = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    let saved = '';
    try {
      saved = sessionStorage.getItem(NATIVE_OAUTH_PAYLOAD_KEY) || '';
    } catch {
      saved = '';
    }
    const [savedSearchRaw, savedHashRaw] = saved.split('#');
    const savedSearch = new URLSearchParams(savedSearchRaw?.replace(/^\?/, '') || '');
    const savedHash = new URLSearchParams(savedHashRaw || '');
    if (search.has('code')) return 'code';
    if (hash.has('access_token') || search.has('access_token')) return 'tokens';
    if (search.has('error') || hash.has('error')) return 'error';
    if (savedSearch.has('code')) return 'code';
    if (savedHash.has('access_token') || savedSearch.has('access_token')) return 'tokens';
    if (savedSearch.has('error') || savedHash.has('error')) return 'error';
    return 'unknown';
  }, []);

  const openApp = async (mode: 'manual' | 'auto' = 'manual') => {
    const query = await resolvePayloadQuery();
    logDiagnostic('native_oauth_bridge_open_app', { kind: callbackKind, mode, hasPayload: hasOAuthPayload(query) });
    window.location.href = buildIntentUrl(query);
    setTimeout(() => {
      window.location.href = buildSchemeUrl(query);
    }, 800);
  };

  useEffect(() => {
    logDiagnostic('native_oauth_bridge_received', { kind: callbackKind });
    // Auto-launch the APK as soon as the bridge page renders.
    void openApp('auto');
  }, [callbackKind]);

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
