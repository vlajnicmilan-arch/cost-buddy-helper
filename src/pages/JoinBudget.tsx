import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type InvitationStatus = 'loading' | 'valid' | 'expired' | 'invalid' | 'already_member' | 'joining' | 'success';

export default function JoinBudget() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [status, setStatus] = useState<InvitationStatus>('loading');
  const [budgetName, setBudgetName] = useState<string>('');
  const [invitationData, setInvitationData] = useState<any>(null);

  useEffect(() => {
    const checkInvitation = async () => {
      if (authLoading) return;
      
      if (!token) {
        setStatus('invalid');
        return;
      }

      try {
        // Fetch invitation
        const { data: invitation, error } = await supabase
          .from('budget_invitations')
          .select('*, budget_plans(id, name)')
          .eq('token', token)
          .single();

        if (error || !invitation) {
          setStatus('invalid');
          return;
        }

        // Check if expired
        if (new Date(invitation.expires_at) < new Date()) {
          setStatus('expired');
          return;
        }

        // Check if already accepted
        if (invitation.status !== 'pending') {
          setStatus('invalid');
          return;
        }

        setBudgetName((invitation.budget_plans as any)?.name || 'Budžet');
        setInvitationData(invitation);

        // Check if user is already a member
        if (user) {
          const { data: existingMember } = await supabase
            .from('budget_members')
            .select('id')
            .eq('budget_id', invitation.budget_id)
            .eq('user_id', user.id)
            .single();

          if (existingMember) {
            setStatus('already_member');
            return;
          }
        }

        setStatus('valid');
      } catch (error) {
        console.error('Error checking invitation:', error);
        setStatus('invalid');
      }
    };

    checkInvitation();
  }, [token, user, authLoading]);

  const handleJoin = async () => {
    if (!user || !invitationData) {
      navigate('/auth', { state: { returnTo: `/join-budget/${token}` } });
      return;
    }

    setStatus('joining');

    try {
      // Get user's display name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single();

      // Add member
      const { error: memberError } = await supabase
        .from('budget_members')
        .insert({
          budget_id: invitationData.budget_id,
          user_id: user.id,
          role: invitationData.role
        });

      if (memberError) throw memberError;

      // Update invitation status (only for email invites)
      if (invitationData.email !== 'link-invite') {
        await supabase
          .from('budget_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitationData.id);
      }

      setStatus('success');
      toast.success(t('budget.joinedSuccess', 'Uspješno ste se pridružili budžetu!'));
      
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error) {
      console.error('Error joining budget:', error);
      toast.error(t('common.error', 'Greška'));
      setStatus('valid');
    }
  };

  if (authLoading || status === 'loading') {
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
            {status === 'success' ? (
              <CheckCircle className="w-8 h-8 text-income" />
            ) : status === 'expired' || status === 'invalid' ? (
              <XCircle className="w-8 h-8 text-destructive" />
            ) : (
              <Target className="w-8 h-8 text-primary" />
            )}
          </div>
          <CardTitle>
            {status === 'valid' && t('budget.joinBudget', 'Pridruži se budžetu')}
            {status === 'expired' && t('budget.linkExpired', 'Link je istekao')}
            {status === 'invalid' && t('budget.invalidLink', 'Nevažeći link')}
            {status === 'already_member' && t('budget.alreadyMember', 'Već ste član')}
            {status === 'joining' && t('budget.joining', 'Pridruživanje...')}
            {status === 'success' && t('budget.welcome', 'Dobrodošli!')}
          </CardTitle>
          <CardDescription>
            {status === 'valid' && (
              <>
                {t('budget.invitedTo', 'Pozvani ste da se pridružite budžetu')}{' '}
                <strong className="text-foreground">{budgetName}</strong>
              </>
            )}
            {status === 'expired' && t('budget.linkExpiredDesc', 'Ovaj pozivni link je istekao. Zamolite vlasnika budžeta za novi link.')}
            {status === 'invalid' && t('budget.invalidLinkDesc', 'Ovaj pozivni link nije valjan ili je već iskorišten.')}
            {status === 'already_member' && t('budget.alreadyMemberDesc', 'Već ste član ovog budžeta.')}
            {status === 'success' && t('budget.successDesc', 'Uspješno ste se pridružili budžetu. Preusmjeravanje...')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'valid' && (
            <div className="space-y-4">
              {!user && (
                <p className="text-sm text-muted-foreground text-center">
                  {t('budget.loginRequired', 'Morate biti prijavljeni da biste se pridružili budžetu.')}
                </p>
              )}
              <Button className="w-full" onClick={handleJoin}>
                {user ? t('budget.joinNow', 'Pridruži se') : t('budget.loginAndJoin', 'Prijava i pridruživanje')}
              </Button>
            </div>
          )}
          {status === 'joining' && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {(status === 'expired' || status === 'invalid' || status === 'already_member') && (
            <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
              {t('common.backHome', 'Povratak na početnu')}
            </Button>
          )}
          {status === 'success' && (
            <Button className="w-full" onClick={() => navigate('/')}>
              {t('budget.goToDashboard', 'Idi na dashboard')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
