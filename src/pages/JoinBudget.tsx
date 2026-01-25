import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const JoinBudget = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired' | 'auth_required'>('loading');
  const [budgetName, setBudgetName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const processInvitation = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage(t('budget.invalidLink', 'Nevažeći link pozivnice'));
        return;
      }

      // Check if user is authenticated
      if (!authLoading && !user) {
        setStatus('auth_required');
        return;
      }

      if (authLoading || !user) return;

      try {
        // Fetch invitation
        const { data: invitation, error: invError } = await supabase
          .from('budget_invitations')
          .select('*, budget_plans(name)')
          .eq('token', token)
          .eq('status', 'pending')
          .single();

        if (invError || !invitation) {
          setStatus('expired');
          setErrorMessage(t('budget.invitationExpired', 'Pozivnica je istekla ili ne postoji'));
          return;
        }

        // Check if expired
        if (new Date(invitation.expires_at) < new Date()) {
          setStatus('expired');
          setErrorMessage(t('budget.invitationExpired', 'Pozivnica je istekla'));
          return;
        }

        setBudgetName((invitation.budget_plans as any)?.name || 'Budžet');

        // Check if already a member
        const { data: existingMember } = await supabase
          .from('budget_members')
          .select('id')
          .eq('budget_id', invitation.budget_id)
          .eq('user_id', user.id)
          .single();

        if (existingMember) {
          setStatus('success');
          return;
        }

        // Add user as member
        const { error: memberError } = await supabase
          .from('budget_members')
          .insert({
            budget_id: invitation.budget_id,
            user_id: user.id,
            role: invitation.role
          });

        if (memberError) throw memberError;

        // Update invitation status
        await supabase
          .from('budget_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitation.id);

        setStatus('success');
      } catch (error) {
        console.error('Error processing invitation:', error);
        setStatus('error');
        setErrorMessage(t('budget.joinError', 'Greška pri pridruživanju'));
      }
    };

    processInvitation();
  }, [token, user, authLoading, t]);

  const handleGoToAuth = () => {
    localStorage.setItem('redirect_after_auth', `/join-budget/${token}`);
    navigate('/auth');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>{t('budget.joinBudget', 'Pridruži se budžetu')}</CardTitle>
          <CardDescription>
            {budgetName && `${budgetName}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">{t('common.loading', 'Učitavanje...')}</p>
            </div>
          )}

          {status === 'auth_required' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-muted-foreground">
                {t('budget.loginRequired', 'Morate se prijaviti da biste se pridružili budžetu')}
              </p>
              <Button onClick={handleGoToAuth}>
                {t('auth.login', 'Prijava')}
              </Button>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="font-medium">{t('budget.joinSuccess', 'Uspješno ste se pridružili!')}</p>
              <Button onClick={handleGoHome}>
                {t('budget.goToApp', 'Idi na aplikaciju')}
              </Button>
            </div>
          )}

          {(status === 'error' || status === 'expired') && (
            <div className="flex flex-col items-center gap-4">
              <XCircle className="w-12 h-12 text-destructive" />
              <p className="text-destructive">{errorMessage}</p>
              <Button variant="outline" onClick={handleGoHome}>
                {t('common.goHome', 'Idi na početnu')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinBudget;
