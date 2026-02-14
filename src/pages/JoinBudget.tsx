import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, Target, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TargetData {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

export default function JoinBudget() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [targetData, setTargetData] = useState<TargetData | null>(null);

  useEffect(() => {
    if (!token) {
      setError(t('join.invalidLink', 'Link nije valjan'));
      setLoading(false);
      return;
    }

    // Token will be validated server-side on accept
    setLoading(false);
  }, [token]);

  const handleAccept = async () => {
    if (!token || !user) return;

    setAccepting(true);
    setError(null);

    try {
      // Use unified edge function with type parameter
      const { data, error: fnError } = await supabase.functions.invoke('accept-project-invitation', {
        body: { token, type: 'budget' }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        setError(data.error);
      } else if (data?.success) {
        setSuccess(true);
        setTargetData(data.target);
        
        // Redirect after short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || t('join.errorJoiningBudget', 'Greška pri pridruživanju budžetu'));
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginRedirect = () => {
    sessionStorage.setItem('returnUrl', `/join-budget/${token}`);
    navigate('/auth');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            {success ? (
              <CheckCircle className="w-8 h-8 text-income" />
            ) : error ? (
              <XCircle className="w-8 h-8 text-destructive" />
            ) : (
              <Target className="w-8 h-8 text-primary" />
            )}
          </div>
          <CardTitle>
            {success 
              ? t('budget.welcome', 'Dobrodošli!')
              : error 
                ? t('common.error')
                : t('budget.joinBudget', 'Pridruži se budžetu')
            }
          </CardTitle>
          <CardDescription>
            {success && targetData
              ? `${targetData.icon || '🎯'} ${targetData.name}`
              : error 
                ? error
                : t('budget.invitedTo', 'Pozvani ste da se pridružite budžetu')
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {success ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('budget.successDesc', 'Uspješno ste se pridružili budžetu. Preusmjeravanje...')}
            </p>
          ) : error ? (
            <Button 
              onClick={() => navigate('/')} 
              variant="outline" 
              className="w-full"
            >
              {t('common.backHome', 'Povratak na početnu')}
            </Button>
          ) : !user ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                {t('budget.loginRequired', 'Morate biti prijavljeni da biste se pridružili budžetu.')}
              </p>
              <Button onClick={handleLoginRedirect} className="w-full">
                <LogIn className="w-4 h-4 mr-2" />
                {t('auth.signIn')}
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <Button 
                onClick={handleAccept} 
                className="w-full"
                disabled={accepting}
              >
                {accepting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {t('budget.joinNow', 'Pridruži se')}
              </Button>
              <Button 
                onClick={() => navigate('/')} 
                variant="outline" 
                className="w-full"
              >
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
