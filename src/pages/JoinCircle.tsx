import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, Users, LogIn } from 'lucide-react';

interface InvitationData {
  id: string;
  income_source_id: string;
  expires_at: string;
  status: string;
  source_name?: string;
  source_icon?: string;
}

const JoinCircle = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sourceName, setSourceName] = useState<string>('');

  // Fetch invitation details
  useEffect(() => {
    const fetchInvitation = async () => {
      if (!token) {
        setError('Neispravan link pozivnice');
        setLoading(false);
        return;
      }

      try {
        // We need to use a public query or edge function here
        // For now, we'll just validate when accepting
        setLoading(false);
      } catch (err) {
        console.error('Error fetching invitation:', err);
        setError('Greška pri učitavanju pozivnice');
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!token || !user) return;
    
    setAccepting(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('accept-invitation', {
        body: { token }
      });

      if (error) throw error;
      
      if (data?.error) {
        setError(data.error);
      } else {
        setSuccess(true);
        setSourceName(data?.source?.name || 'Krug prihoda');
        
        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || 'Greška pri prihvaćanju pozivnice');
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginRedirect = () => {
    // Store the return URL for after login
    sessionStorage.setItem('returnUrl', `/join/${token}`);
    navigate('/auth');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-income/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-income" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Uspješno!</h2>
                <p className="text-muted-foreground mt-1">
                  Pridružili ste se krugu "{sourceName}"
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Preusmjeravanje...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Greška</h2>
                <p className="text-muted-foreground mt-1">{error}</p>
              </div>
              <Button onClick={() => navigate('/')} variant="outline">
                Povratak na početnu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Pozivnica u krug prihoda</CardTitle>
            <CardDescription>
              Pozvani ste da se pridružite krugu prihoda. Prijavite se kako biste prihvatili pozivnicu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLoginRedirect} className="w-full gap-2">
              <LogIn className="w-4 h-4" />
              Prijavi se za prihvaćanje
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Logged in - show accept button
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Pridružite se krugu prihoda</CardTitle>
          <CardDescription>
            Pozvani ste da se pridružite dijeljenom krugu prihoda. Prihvaćanjem ćete moći vidjeti zajedničke transakcije i dodavati vlastite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-sm text-muted-foreground">Prijavljeni ste kao</p>
            <p className="font-medium">{user.email}</p>
          </div>
          
          <Button 
            onClick={handleAccept} 
            className="w-full gap-2"
            disabled={accepting}
          >
            {accepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Prihvati pozivnicu
          </Button>
          
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={() => navigate('/')}
          >
            Odustani
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinCircle;
