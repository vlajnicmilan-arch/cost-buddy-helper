import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let initialSessionChecked = false;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Only mark authReady after initial session is also checked
        if (initialSessionChecked) {
          setAuthReady(true);
        }

        // Track login device info (fire and forget)
        if (event === 'SIGNED_IN' && session?.user) {
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
            user_id: session.user.id,
            device_info: deviceInfo,
          } as any).then(() => {});

          // Auto-otkaži pending brisanje računa ako se korisnik prijavi unutar grace perioda
          supabase.functions.invoke('cancel-account-deletion').then(({ data }) => {
            if (data?.success) console.log('[auth] Pending account deletion cancelled on sign-in');
          }).catch(() => {});
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      initialSessionChecked = true;
      setAuthReady(true);

      // Track app open (session restore)
      if (session?.user) {
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
          user_id: session.user.id,
          device_info: deviceInfo,
        } as any).then(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
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
    
    return { data, error, needsEmailConfirmation };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resendVerificationEmail = async (email: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { error };
  };

  return {
    user,
    session,
    loading,
    authReady,
    signUp,
    signIn,
    signOut,
    resendVerificationEmail,
    resetPassword,
    updatePassword
  };
};
