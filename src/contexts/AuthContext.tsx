import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authReady: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ data: any; error: any; needsEmailConfirmation: boolean | null }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  resendVerificationEmail: (email: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Guard against firing the same one-shot side-effects (login_logs insert,
  // funnel signup, account-deletion cancel) for duplicate auth events.
  const initialSessionCheckedRef = useRef(false);
  const lastSignedInUserRef = useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        // Only mark loading=false / authReady=true after the initial
        // getSession() resolves below. Premature flips cause downstream
        // hooks to fire fetches before the session is restored.
        if (initialSessionCheckedRef.current) {
          setLoading(false);
          setAuthReady(true);
        }

        // Track login device info exactly once per signed-in user.
        if (event === 'SIGNED_IN' && nextSession?.user) {
          if (lastSignedInUserRef.current === nextSession.user.id) return;
          lastSignedInUserRef.current = nextSession.user.id;

          const deviceInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            appVersion: APP_VERSION,
            eventType: 'sign_in',
          };
          supabase.from('user_login_logs').insert({
            user_id: nextSession.user.id,
            device_info: deviceInfo,
          } as any).then(() => {});

          import('@/lib/funnelTracking')
            .then(({ logFunnelEvent }) => logFunnelEvent('signup', {
              method: 'sign_in_first_time',
            }))
            .catch(() => {});

          supabase.functions.invoke('cancel-account-deletion').then(({ data }) => {
            if (data?.success) console.log('[auth] Pending account deletion cancelled on sign-in');
          }).catch(() => {});
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      // Validate the restored session against the backend. A locally cached
      // JWT remains "valid" (signature OK, not expired) even after the
      // backend user has been hard-deleted, which would otherwise let the
      // app keep treating that ghost session as logged in and route the
      // user straight into onboarding. `getUser()` hits the Auth server and
      // returns an error (user_not_found / invalid token) in that case.
      let validatedSession = existing;
      if (existing?.user) {
        try {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userData?.user) {
            console.warn('[auth] Restored session rejected by server, signing out:', userErr?.message);
            await supabase.auth.signOut().catch(() => {});
            try {
              const { instantCache } = await import('@/lib/instantCache');
              instantCache.clearAll();
            } catch { /* noop */ }
            validatedSession = null;
          }
        } catch (e) {
          // Network failure — keep the cached session rather than locking
          // the user out on a transient hiccup. Next foreground will retry.
          console.warn('[auth] getUser() validation failed (network?):', (e as Error)?.message);
        }
      }

      setSession(validatedSession);
      setUser(validatedSession?.user ?? null);
      setLoading(false);
      initialSessionCheckedRef.current = true;
      setAuthReady(true);

      if (validatedSession?.user) {
        lastSignedInUserRef.current = validatedSession.user.id;
        const deviceInfo = {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          appVersion: APP_VERSION,
          eventType: 'app_open',
        };
        supabase.from('user_login_logs').insert({
          user_id: validatedSession.user.id,
          device_info: deviceInfo,
        } as any).then(() => {});
      }
    });


    return () => subscription.unsubscribe();
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password, displayName) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });

    const needsEmailConfirmation = data?.user && !data?.session;

    if (data?.user && data?.session && displayName?.trim()) {
      setTimeout(async () => {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('user_id', data.user!.id);
      }, 0);
    }

    if (data?.user && data?.session && !error) {
      import('@/lib/funnelTracking')
        .then(({ logFunnelEvent }) => logFunnelEvent('signup', {
          method: 'email',
          needs_confirmation: false,
        }))
        .catch(() => {});
    }

    return { data, error, needsEmailConfirmation: needsEmailConfirmation ?? null };
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    const { error } = await supabase.auth.signOut();
    try {
      const { instantCache } = await import('@/lib/instantCache');
      instantCache.clearAll();
    } catch { /* noop */ }
    lastSignedInUserRef.current = null;
    return { error };
  };

  const resendVerificationEmail: AuthContextValue['resendVerificationEmail'] = async (email) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error };
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  const updatePassword: AuthContextValue['updatePassword'] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  const value: AuthContextValue = {
    user,
    session,
    loading,
    authReady,
    signUp,
    signIn,
    signOut,
    resendVerificationEmail,
    resetPassword,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
};
