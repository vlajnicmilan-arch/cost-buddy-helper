import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, XCircle, FolderKanban, LogIn } from 'lucide-react';

interface ProjectData {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

const JoinProject = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);

  useEffect(() => {
    if (!token) {
      setError(t('join.invalidLink', 'Link nije valjan'));
      setLoading(false);
      return;
    }

    // For now, just validate the token exists - actual validation happens on accept
    setLoading(false);
  }, [token]);

  const handleAccept = async () => {
    if (!token || !user) return;

    setAccepting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('accept-project-invitation', {
        body: { token, type: 'project' }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        setError(data.error);
      } else if (data?.success) {
        setSuccess(true);
        // Use 'target' from unified response, fallback to 'project' for backward compat
        setProjectData(data.target || data.project);
        
        // Redirect after short delay
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || t('join.errorJoiningProject', 'Greška pri pridruživanju projektu'));
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginRedirect = () => {
    // Store return URL
    sessionStorage.setItem('returnUrl', `/join-project/${token}`);
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            {success ? (
              <CheckCircle className="w-8 h-8 text-green-500" />
            ) : error ? (
              <XCircle className="w-8 h-8 text-destructive" />
            ) : (
              <FolderKanban className="w-8 h-8 text-primary" />
            )}
          </div>
          <CardTitle>
            {success 
              ? t('projects.joinSuccess', 'Pridružili ste se projektu!')
              : error 
                ? t('common.error')
                : t('projects.joinProject', 'Pridruživanje projektu')
            }
          </CardTitle>
          <CardDescription>
            {success && projectData
              ? `${projectData.icon || '📁'} ${projectData.name}`
              : error 
                ? error
                : t('projects.joinDescription', 'Pozvani ste da se pridružite projektu')
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {success ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('projects.redirecting', 'Preusmjeravanje...')}
            </p>
          ) : error ? (
            <Button 
              onClick={() => navigate('/')} 
              variant="outline" 
              className="w-full"
            >
              {t('common.back')}
            </Button>
          ) : !user ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                {t('projects.loginRequired', 'Morate se prijaviti da biste se pridružili projektu')}
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
                {t('projects.acceptInvitation', 'Prihvati pozivnicu')}
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
};

export default JoinProject;
