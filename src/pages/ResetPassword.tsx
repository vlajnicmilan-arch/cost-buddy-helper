import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Lock, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/logo.webp';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

import i18n from '@/i18n';

const passwordSchema = z.object({
  password: z.string().min(6, i18n.t('auth.validation.passwordTooShort')).max(72, i18n.t('auth.validation.passwordTooLong')),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: i18n.t('auth.validation.passwordsDontMatch'),
  path: ['confirmPassword']
});

const ResetPassword = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [success, setSuccess] = useState(false);
  
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Listen for auth events to catch the PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsValidSession(true);
          setCheckingSession(false);
        } else if (session) {
          // User has a valid session from the reset link
          setIsValidSession(true);
          setCheckingSession(false);
        }
      });

      // If we already have a session, allow password reset
      if (session) {
        setIsValidSession(true);
      }
      
      setCheckingSession(false);

      return () => subscription.unsubscribe();
    };

    checkSession();
  }, []);

  const validateForm = () => {
    try {
      passwordSchema.parse({ password, confirmPassword });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { password?: string; confirmPassword?: string } = {};
        error.errors.forEach(err => {
          if (err.path[0] === 'password') fieldErrors.password = err.message;
          if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      const { error } = await updatePassword(password);
      
      if (error) {
        showError(t('errors.auth.passwordChangeFailed', 'Greška pri promjeni lozinke'));
        return;
      }
      
      setSuccess(true);
      showSuccess(t('toasts.passwordChanged'));
      // Sign out so the user must log in with the new password
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  // Loading state while checking session
  if (checkingSession) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">{t('auth.reset.checkingSession')}</p>
        </div>
      </div>
    );
  }

  // Invalid session - no recovery token
  if (!isValidSession) {
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
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('auth.reset.invalidLinkTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.reset.invalidLinkDesc')}
              </p>
            </div>

            <Button
              className="w-full h-12 rounded-xl"
              onClick={() => navigate('/auth')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('auth.backToLogin')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
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
            <div className="w-16 h-16 bg-income/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-income" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{t('auth.reset.successTitle')}</h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.reset.successDesc')}
              </p>
            </div>

            <Button
              className="w-full h-12 rounded-xl"
              onClick={() => navigate('/auth')}
            >
              {t('auth.reset.continueToLogin')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form
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
            Unesite novu lozinku
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">Nova lozinka</Label>
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
            <p className="text-xs text-muted-foreground">
              Minimalno 6 znakova
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Potvrdi lozinku</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`pl-10 h-12 rounded-xl ${errors.confirmPassword ? 'border-destructive' : ''}`}
                required
                maxLength={72}
              />
            </div>
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl font-medium"
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Promijeni lozinku
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate('/auth')}
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
};

export default ResetPassword;
