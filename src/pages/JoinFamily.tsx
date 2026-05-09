import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

const JoinFamily = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'auth_required'>('loading');
  const [groupName, setGroupName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setStatus('auth_required');
      return;
    }

    if (!token) {
      setStatus('error');
      setErrorMessage('Nevažeći link pozivnice.');
      return;
    }

    const acceptInvitation = async () => {
      try {
        const { data, error } = await supabase.rpc('consume_invitation_token', {
          _invitation_type: 'family',
          _token: token
        });

        if (error) throw error;

        if (!data || data.length === 0) {
          setStatus('error');
          setErrorMessage('Pozivnica je istekla ili je već iskorištena.');
          return;
        }

        const invitation = data[0];
        setGroupName(invitation.target_name);

        // Add user as member
        const { error: memberError } = await supabase
          .from('family_members')
          .insert({
            group_id: invitation.target_id,
            user_id: user.id,
            role: invitation.role
          });

        if (memberError) {
          if (memberError.code === '23505') {
            setGroupName(invitation.target_name);
            setStatus('success');
            return;
          }
          throw memberError;
        }

        setStatus('success');
        showSuccess(t('toasts.joinedGroup', { name: invitation.target_name }));
      } catch (error) {
        console.error('Error accepting family invitation:', error);
        setStatus('error');
        setErrorMessage('Greška pri pridruživanju. Pokušajte ponovo.');
      }
    };

    acceptInvitation();
  }, [token, user, authLoading]);

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Pridruživanje grupi...</p>
        </div>
      </div>
    );
  }

  if (status === 'auth_required') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-xl font-bold">{t('join.familyTitle')}</h1>
          <p className="text-muted-foreground">Morate se prijaviti za pridruživanje grupi.</p>
          <Button onClick={() => navigate('/auth', { state: { returnTo: `/join-family/${token}` } })}>
            Prijavi se
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <XCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">{t('join.error')}</h1>
          <p className="text-muted-foreground">{errorMessage}</p>
          <Button onClick={() => navigate('/family')}>Idi na Obitelj</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <CheckCircle className="w-12 h-12 text-primary mx-auto" />
        <h1 className="text-xl font-bold">Uspješno!</h1>
        <p className="text-muted-foreground">Pridružili ste se grupi "{groupName}".</p>
        <Button onClick={() => navigate('/family')}>Otvori obiteljski dashboard</Button>
      </div>
    </div>
  );
};

export default JoinFamily;
