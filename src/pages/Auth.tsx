import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { friendlyError } from '@/lib/errorMessages';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { useNavigate, useLocation } from 'react-router-dom';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Mail, Lock, Loader2, CheckCircle, RefreshCw, User, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/logo.webp';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';
import { useStorage } from '@/contexts/StorageContext';
import { lovable } from '@/integrations/lovable/index';
import { Capacitor } from '@capacitor/core';
import { useNativeOAuth } from '@/hooks/useNativeOAuth';

import i18n from '@/i18n';
const authSchema = z.object({
  email: z.string().trim().email(i18n.t('auth.validation.invalidEmail')).max(255, i18n.t('auth.validation.emailTooLong')),
  password: z.string().min(6, i18n.t('auth.validation.passwordTooShort')).max(72, i18n.t('auth.validation.passwordTooLong'))
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(false);
  
  const { signIn, signUp, resendVerificationEmail, resetPassword, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { storageMode, setStorageMode } = useStorage();
  const { t } = useTranslation();
  const { signInWithOAuth: signInWithOAuthNative, isNative } = useNativeOAuth();

  // Auto-switch to signup mode if navigated with mode: 'signup'
  useEffect(() => {
    if ((location.state as any)?.mode === 'signup') setIsLogin(false);
  }, [location.state]);

  // Redirect is now handled centrally by App.tsx routing.
  // Auth page only handles authentication actions.
  // When user becomes available, ensure cloud storage mode is set.
  useEffect(() => {
    if (user && !storageMode) {
      setStorageMode('cloud');
    }
  }, [user, storageMode, setStorageMode]);

  // Check if user came from storage setup - allow going back
  const cameFromSetup = (location.state as any)?.from === '/setup';
  const canGoBack = cameFromSetup || storageMode;

  const handleGoBack = () => {
    if (cameFromSetup) {
      navigate('/setup');
    } else if (storageMode) {
      navigate('/home');
    }
  };

  const validateForm = () => {
    try {
      authSchema.parse({ email: email.trim(), password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach(err => {
          if (err.path[0] === 'email') fieldErrors.email = err.message;
          if (err.path[0] === 'password') fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const trackReferral = async () => {
    const referrerId = localStorage.getItem('referrer_id');
    if (!referrerId) return;
    try {
      await supabase.functions.invoke('track-referral', {
        body: { referrer_id: referrerId },
      });
      localStorage.removeItem('referrer_id');
    } catch (err) {
      console.error('Referral tracking failed:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            // Track failed attempts per email (sessionStorage)
            const key = `failed_login_${email.trim().toLowerCase()}`;
            const attempts = Number(sessionStorage.getItem(key) || '0') + 1;
            sessionStorage.setItem(key, String(attempts));
            const MAX_ATTEMPTS = 5;
            const remaining = MAX_ATTEMPTS - attempts;
            if (attempts >= MAX_ATTEMPTS) {
              sessionStorage.removeItem(key);
              showError(t('toasts.tooManyAttempts', 'Previše neuspjelih pokušaja. Resetirajte lozinku.'));
              setShowForgotPassword(true);
              setPassword('');
              return;
            }
            showError(
              `${t('toasts.wrongEmailOrPassword')} (${t('toasts.attemptsRemaining', 'preostalo pokušaja')}: ${remaining})`
            );
          } else if (error.message.includes('Email not confirmed')) {
            showError(t('toasts.emailNotConfirmed'));
            setAwaitingVerification(true);
            setRegisteredEmail(email.trim());
          } else {
            showError(friendlyError(error));
          }
          return;
        }
        // success → reset counter
        sessionStorage.removeItem(`failed_login_${email.trim().toLowerCase()}`);
        if (!storageMode) {
          setStorageMode('cloud');
        }
        showSuccess(t('toasts.welcomeBack'));
        // Routing is handled centrally by App.tsx — no navigate needed here
      } else {
        const { error, needsEmailConfirmation } = await signUp(email.trim(), password, displayName.trim() || undefined);
        if (error) {
          if (error.message.includes('already registered')) {
            showError(t('toasts.userAlreadyExists'));
          } else {
            showError(friendlyError(error));
          }
          return;
        }
        
        if (needsEmailConfirmation) {
          if (!storageMode) setStorageMode('cloud');
          setAwaitingVerification(true);
          setRegisteredEmail(email.trim());
          showSuccess(t('toasts.registrationSuccess'));
          trackReferral();
        } else {
          // Use entered name or fallback to email-extracted name
          let welcomeName = displayName.trim();
          if (!welcomeName) {
            const extractedName = email.trim().split('@')[0];
            welcomeName = extractedName
              .replace(/[._]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
          setNewUserName(welcomeName);
          setShowWelcome(true);
          trackReferral();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!registeredEmail) return;
    
    setResendLoading(true);
    try {
      const { error } = await resendVerificationEmail(registeredEmail);
      if (error) {
        showError(t('toasts.emailSendError'));
      } else {
        showSuccess(t('toasts.verificationEmailSent'));
      }
    } finally {
      setResendLoading(false);
    }
  };

  const resetToLogin = () => {
    setAwaitingVerification(false);
    setIsLogin(true);
    setEmail(registeredEmail);
    setPassword('');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrors({ email: t('toasts.enterEmail') });
      return;
    }
    
    try {
      z.string().email().parse(trimmedEmail);
    } catch {
      setErrors({ email: t('auth.validation.invalidEmail') });
      return;
    }
    
    setResetLoading(true);
    setErrors({});
    
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) {
        showError(friendlyError(error, 'errors.auth.emailSendFailed', 'Greška pri slanju emaila'));
        return;
      }
      setResetEmailSent(true);
      setRegisteredEmail(trimmedEmail);
      showSuccess(t('toasts.passwordResetEmailSent'));
    } finally {
      setResetLoading(false);
    }
  };

  const backToLogin = () => {
    setShowForgotPassword(false);
    setResetEmailSent(false);
    setErrors({});
  };

  // Welcome screen with confetti for new users
  if (showWelcome) {
    return (
      <WelcomeConfetti
        displayName={newUserName}
        onComplete={() => {
          setShowWelcome(false);
          if (!storageMode) {
            setStorageMode('cloud');
          }
          navigate('/onboarding');
        }}
      />
    );
  }

  // Email verification waiting screen
  if (awaitingVerification) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
          </div>

          {/* Verification Card */}
          <div className="glass-card rounded-2xl p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('auth.checkEmail')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.sentTo')}
              </p>
              <p className="font-medium text-primary">{registeredEmail}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.clickLink')}</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.checkSpam')}</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.linkValid')}</span>
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl"
                onClick={handleResendEmail}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t('auth.resend')}
              </Button>
              
              <Button
                className="w-full h-12 rounded-xl"
                onClick={resetToLogin}
              >
                {t('auth.alreadyConfirmed')}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t('auth.wrongEmail')}{' '}
              <button
                type="button"
                onClick={() => {
                  setAwaitingVerification(false);
                  setIsLogin(false);
                  setEmail('');
                  setPassword('');
                }}
                className="text-primary hover:underline"
              >
                {t('auth.registerAgain')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Password reset email sent screen
  if (resetEmailSent) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
          </div>

          <div className="glass-card rounded-2xl p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('auth.checkEmail')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.resetSentTo')}
              </p>
              <p className="font-medium text-primary">{registeredEmail}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.clickResetLink')}</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.checkSpam')}</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>{t('auth.resetLinkValid')}</span>
              </p>
            </div>

            <Button
              className="w-full h-12 rounded-xl"
              onClick={backToLogin}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('auth.backToLogin')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Forgot password form
  if (showForgotPassword) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
            <p className="text-muted-foreground mt-2">
              {t('auth.forgotPasswordTitle')}
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="glass-card rounded-2xl p-6 space-y-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>{t('auth.resetEmailHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resetEmail">{t('auth.emailLabel')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder={t('placeholders.yourEmail')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`pl-10 h-12 rounded-xl ${errors.email ? 'border-destructive' : ''}`}
                  required
                  maxLength={255}
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl font-medium"
              disabled={resetLoading}
            >
              {resetLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('auth.sendResetLink')}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={backToLogin}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 inline mr-1" />
                {t('auth.backToLogin')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Back button - show when user can go back */}
        {canGoBack && (
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t('common.back')}</span>
          </button>
        )}
        
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
          <p className="text-muted-foreground mt-2">
            {isLogin ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-6">
          {/* Name field - only for registration */}
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('auth.nameOptional')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder={t('placeholders.yourName')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-10 h-12 rounded-xl"
                  maxLength={50}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('auth.nameHint')}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.emailLabel')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t('placeholders.yourEmail')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`pl-10 h-12 rounded-xl ${errors.email ? 'border-destructive' : ''}`}
                required
                maxLength={255}
              />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('auth.password')}</Label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setErrors({});
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {t('auth.forgotPassword')}
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`pl-10 h-12 rounded-xl ${errors.password ? 'border-destructive' : ''}`}
                required
                maxLength={72}
              />
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
           {!isLogin && (
              <p className="text-xs text-muted-foreground">
                {t('auth.minPassword')}
              </p>
            )}
          </div>

          {/* GDPR Consent checkbox - only on registration */}
          {!isLogin && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="gdprConsent"
                checked={gdprConsent}
                onChange={(e) => setGdprConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="gdprConsent" className="text-xs text-muted-foreground leading-relaxed">
                {t('gdpr.consentLabel', 'Prihvaćam {link} i suglasan/na sam s obradom osobnih podataka u skladu s GDPR regulativom.').split('{link}')[0]}
                <button
                  type="button"
                  onClick={() => navigate('/privacy-policy')}
                  className="text-primary hover:underline"
                >
                  {t('gdpr.privacyPolicyLink', 'Politiku privatnosti')}
                </button>
                {t('gdpr.consentLabel', 'Prihvaćam {link} i suglasan/na sam s obradom osobnih podataka u skladu s GDPR regulativom.').split('{link}')[1]}
              </label>
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl font-medium"
            disabled={loading || (!isLogin && !gdprConsent)}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLogin ? t('auth.login') : t('auth.register')}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t('auth.orDivider')}</span>
            </div>
          </div>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-xl font-medium gap-3"
            onClick={async () => {
              setLoading(true);
              try {
                if (!storageMode) {
                  setStorageMode('cloud');
                }

                if (isNative) {
                  const { error } = await signInWithOAuthNative('google');
                  if (error) {
                    showError(t('errors.auth.googleSignInFailed', 'Greška pri Google prijavi'));
                    console.error('Google native OAuth error:', error);
                  }
                } else {
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: `${window.location.origin}/app`,
                    extraParams: { prompt: "select_account" },
                  });
                  if (error) {
                    showError(t('errors.auth.googleSignInFailed', 'Greška pri Google prijavi'));
                    console.error('Google OAuth error:', error);
                  }
                }
              } catch (err) {
                showError(t('errors.auth.googleSignInFailed', 'Greška pri Google prijavi'));
                console.error('Google OAuth error:', err);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t('auth.continueWithGoogle')}
          </Button>

          {/* Apple Sign-In */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-xl font-medium gap-3"
            onClick={async () => {
              setLoading(true);
              try {
                if (!storageMode) {
                  setStorageMode('cloud');
                }

                if (isNative) {
                  const { error } = await signInWithOAuthNative('apple');
                  if (error) {
                    showError(t('errors.auth.appleSignInFailed', 'Greška pri Apple prijavi'));
                    console.error('Apple native OAuth error:', error);
                  }
                } else {
                  const { error } = await lovable.auth.signInWithOAuth("apple", {
                    redirect_uri: `${window.location.origin}/app`,
                  });
                  if (error) {
                    showError(t('errors.auth.appleSignInFailed', 'Greška pri Apple prijavi'));
                    console.error('Apple OAuth error:', error);
                  }
                }
              } catch (err) {
                showError(t('errors.auth.appleSignInFailed', 'Greška pri Apple prijavi'));
                console.error('Apple OAuth error:', err);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Nastavi s Apple računom
          </Button>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? 'Nemate račun?' : 'Već imate račun?'}
            </span>
            {' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
                setGdprConsent(false);
              }}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? 'Registrirajte se' : 'Prijavite se'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Auth;