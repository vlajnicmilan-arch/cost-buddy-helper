import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Mail, Lock, Loader2, CheckCircle, RefreshCw, User, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/logo.png';
import { WelcomeConfetti } from '@/components/WelcomeConfetti';
import { useStorage } from '@/contexts/StorageContext';

const authSchema = z.object({
  email: z.string().trim().email('Nevažeća email adresa').max(255, 'Email je predugačak'),
  password: z.string().min(6, 'Lozinka mora imati najmanje 6 znakova').max(72, 'Lozinka je predugačka')
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
  
  const { signIn, signUp, resendVerificationEmail, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { storageMode } = useStorage();
  const { t } = useTranslation();
  
  // Check if user came from storage setup - allow going back
  const cameFromSetup = (location.state as any)?.from === '/setup';
  const canGoBack = cameFromSetup || storageMode;

  const handleGoBack = () => {
    if (cameFromSetup) {
      navigate('/setup');
    } else if (storageMode) {
      navigate('/');
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
            toast.error('Pogrešan email ili lozinka');
          } else if (error.message.includes('Email not confirmed')) {
            toast.error('Email adresa nije potvrđena. Provjerite inbox.');
            setAwaitingVerification(true);
            setRegisteredEmail(email.trim());
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success('Dobrodošli natrag!');
        const returnTo = (location.state as any)?.returnTo;
        navigate(returnTo || '/');
      } else {
        const { error, needsEmailConfirmation } = await signUp(email.trim(), password, displayName.trim() || undefined);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Korisnik s ovim emailom već postoji');
          } else {
            toast.error(error.message);
          }
          return;
        }
        
        if (needsEmailConfirmation) {
          setAwaitingVerification(true);
          setRegisteredEmail(email.trim());
          toast.success('Registracija uspješna! Provjerite email.');
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
        toast.error('Greška pri slanju emaila. Pokušajte kasnije.');
      } else {
        toast.success('Verifikacijski email je poslan!');
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
      setErrors({ email: 'Unesite email adresu' });
      return;
    }
    
    try {
      z.string().email().parse(trimmedEmail);
    } catch {
      setErrors({ email: 'Nevažeća email adresa' });
      return;
    }
    
    setResetLoading(true);
    setErrors({});
    
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) {
        toast.error(error.message || 'Greška pri slanju emaila');
        return;
      }
      setResetEmailSent(true);
      setRegisteredEmail(trimmedEmail);
      toast.success('Email za resetiranje lozinke je poslan!');
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
          navigate('/');
        }}
      />
    );
  }

  // Email verification waiting screen
  if (awaitingVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
              <h2 className="text-xl font-semibold">Provjerite svoj email</h2>
              <p className="text-muted-foreground text-sm">
                Poslali smo verifikacijski link na:
              </p>
              <p className="font-medium text-primary">{registeredEmail}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Kliknite na link u emailu za potvrdu računa</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Provjerite spam/junk folder ako ne vidite email</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Link vrijedi 24 sata</span>
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
                Pošalji ponovo
              </Button>
              
              <Button
                className="w-full h-12 rounded-xl"
                onClick={resetToLogin}
              >
                Već sam potvrdio/la - Prijavi se
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Pogrešan email?{' '}
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
                Registriraj se ponovo
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
              <h2 className="text-xl font-semibold">Provjerite svoj email</h2>
              <p className="text-muted-foreground text-sm">
                Poslali smo link za resetiranje lozinke na:
              </p>
              <p className="font-medium text-primary">{registeredEmail}</p>
            </div>

            <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Kliknite na link u emailu za resetiranje lozinke</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Provjerite spam/junk folder ako ne vidite email</span>
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Link vrijedi 1 sat</span>
              </p>
            </div>

            <Button
              className="w-full h-12 rounded-xl"
              onClick={backToLogin}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Natrag na prijavu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Forgot password form
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
            <p className="text-muted-foreground mt-2">
              Zaboravljena lozinka
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="glass-card rounded-2xl p-6 space-y-6">
            <div className="text-center text-sm text-muted-foreground">
              <p>Unesite svoju email adresu i poslat ćemo vam link za resetiranje lozinke.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="vas@email.com"
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
              Pošalji link za resetiranje
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={backToLogin}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 inline mr-1" />
                Natrag na prijavu
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Back button - show when user can go back */}
        {canGoBack && (
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Natrag</span>
          </button>
        )}
        
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <img src={logo} alt="V&M Balance" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">V&M Balance</h1>
          <p className="text-muted-foreground mt-2">
            {isLogin ? 'Prijavite se na svoj račun' : 'Kreirajte novi račun'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-6">
          {/* Name field - only for registration */}
          {!isLogin && (
            <div className="space-y-2">
              <Label htmlFor="displayName">Ime (opcionalno)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Vaše ime"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-10 h-12 rounded-xl"
                  maxLength={50}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ako ne unesete ime, koristit će se ime iz email adrese
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="vas@email.com"
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
              <Label htmlFor="password">Lozinka</Label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setErrors({});
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Zaboravljena lozinka?
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
                Minimalno 6 znakova
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
            {isLogin ? 'Prijava' : 'Registracija'}
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