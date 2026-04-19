import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { OPTIONAL_TABS } from '@/hooks/useProjectMemberPermissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, XCircle, FolderKanban, LogIn, User, Briefcase } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';

interface ProjectData {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface BusinessProfileLite {
  id: string;
  company_name: string;
}

const JoinProject = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { setBusinessModeEnabled, setActiveBusinessProfileId } = useAppState();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);

  // Context choice for the invitee
  const [suggestedContext, setSuggestedContext] = useState<'personal' | 'business'>('personal');
  const [chosenContext, setChosenContext] = useState<'personal' | 'business'>('personal');
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfileLite[]>([]);
  const [chosenBusinessProfileId, setChosenBusinessProfileId] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setError(t('join.invalidLink', 'Link nije valjan'));
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [token]);

  // Load invitation suggested context + user's business profiles
  useEffect(() => {
    const loadContext = async () => {
      if (!user || !token) return;

      // Read invitation hint (RLS allows invited_user_id = auth.uid OR by token via owner)
      const { data: inv } = await supabase
        .from('project_invitations')
        .select('suggested_context')
        .eq('token', token)
        .maybeSingle();

      const suggested = ((inv as any)?.suggested_context === 'business' ? 'business' : 'personal') as 'personal' | 'business';
      setSuggestedContext(suggested);
      setChosenContext(suggested);

      // Load user's business profiles
      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('id, company_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      const list = (profiles || []) as BusinessProfileLite[];
      setBusinessProfiles(list);
      if (list.length > 0) setChosenBusinessProfileId(list[0].id);
    };
    loadContext();
  }, [user, token]);

  const handleAccept = async () => {
    if (!token || !user) return;

    // Validation: if business chosen, a profile must be selected
    if (chosenContext === 'business' && !chosenBusinessProfileId) {
      setError(t('projects.selectBusinessProfile', 'Odaberite poslovni profil ili odaberite Osobne financije.'));
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('accept-project-invitation', {
        body: {
          token,
          type: 'project',
          memberContext: chosenContext,
          memberBusinessProfileId: chosenContext === 'business' ? chosenBusinessProfileId : null,
        },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        setError(data.error);
      } else if (data?.success) {
        setSuccess(true);
        const target = data.target || data.project;
        setProjectData(target);

        // Init default permissions (all optional tabs hidden) - client-side fallback
        if (target?.id && user) {
          const permRows = OPTIONAL_TABS.map(tab_key => ({
            project_id: target.id,
            user_id: user.id,
            tab_key,
            visible: false,
          }));
          await supabase
            .from('project_member_permissions')
            .upsert(permRows, { onConflict: 'project_id,user_id,tab_key' })
            .then(({ error: permErr }) => {
              if (permErr) console.log('Permissions init fallback error:', permErr.message);
            });
        }

        // If user joined as business, sync context state + localStorage so the project becomes
        // immediately visible after redirect. Use context setters (not just localStorage) since
        // AppStateContext only reads localStorage on mount.
        if (chosenContext === 'business' && chosenBusinessProfileId) {
          setBusinessModeEnabled(true);
          setActiveBusinessProfileId(chosenBusinessProfileId);
          localStorage.setItem('business_mode_enabled', 'true');
          localStorage.setItem('active_business_profile_id', chosenBusinessProfileId);
        } else if (chosenContext === 'personal') {
          setBusinessModeEnabled(false);
          setActiveBusinessProfileId(null);
          localStorage.setItem('business_mode_enabled', 'false');
          localStorage.removeItem('active_business_profile_id');
        }

        setTimeout(() => {
          // Force a full reload (replace) so AppStateContext re-initializes from localStorage.
          window.location.replace('/home');
        }, 1500);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || t('join.errorJoiningProject', 'Greška pri pridruživanju projektu'));
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginRedirect = () => {
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
                : t('projects.joinProject', 'Pridruživanje projektu')}
          </CardTitle>
          <CardDescription>
            {success && projectData
              ? `${projectData.icon || '📁'} ${projectData.name}`
              : error
                ? error
                : t('projects.joinDescription', 'Pozvani ste da se pridružite projektu')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {success ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('projects.redirecting', 'Preusmjeravanje...')}
            </p>
          ) : error ? (
            <Button onClick={() => navigate('/home')} variant="outline" className="w-full">
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
            <div className="space-y-4">
              {/* Context picker for the invitee */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t('projects.whereToShow', 'Gdje želite vidjeti ovaj projekt?')}
                </p>
                {suggestedContext === 'business' && (
                  <p className="text-xs text-muted-foreground">
                    {t('projects.ownerSuggestedBusiness', 'Vlasnik je predložio: Poslovni mod')}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={chosenContext === 'personal' ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 justify-start"
                    onClick={() => setChosenContext('personal')}
                  >
                    <User className="w-4 h-4 mr-2" />
                    {t('projects.contextPersonal', 'Osobne financije')}
                  </Button>
                  <Button
                    type="button"
                    variant={chosenContext === 'business' ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 justify-start"
                    onClick={() => setChosenContext('business')}
                    disabled={businessProfiles.length === 0}
                  >
                    <Briefcase className="w-4 h-4 mr-2" />
                    {t('projects.contextBusiness', 'Poslovni mod')}
                  </Button>
                </div>

                {chosenContext === 'business' && businessProfiles.length > 0 && (
                  <Select value={chosenBusinessProfileId} onValueChange={setChosenBusinessProfileId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('projects.selectProfile', 'Odaberite profil')} />
                    </SelectTrigger>
                    <SelectContent>
                      {businessProfiles.map(bp => (
                        <SelectItem key={bp.id} value={bp.id}>
                          {bp.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {chosenContext === 'business' && businessProfiles.length === 0 && (
                  <div className="space-y-2 p-3 rounded-md border border-dashed bg-muted/40">
                    <p className="text-xs text-foreground">
                      {t('projects.ownerSuggestedBusinessNoProfile', 'Voditelj predlaže poslovni mod, ali nemaš poslovni profil.')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setChosenContext('personal')}
                      >
                        {t('projects.fallbackToPersonal', 'Stavi u Osobne financije')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          sessionStorage.setItem('returnUrl', `/join-project/${token}`);
                          navigate('/business?createProfile=1');
                        }}
                      >
                        {t('projects.createBusinessProfile', 'Kreiraj poslovni profil')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleAccept}
                  className="w-full"
                  disabled={accepting}
                >
                  {accepting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {t('projects.acceptInvitation', 'Prihvati pozivnicu')}
                </Button>
                <Button
                  onClick={() => navigate('/home')}
                  variant="outline"
                  className="w-full"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinProject;
