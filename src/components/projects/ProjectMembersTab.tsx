import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ProjectMember, ProjectInvitation, ProjectRole, PROJECT_ROLE_LABELS } from '@/types/project';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import {
  Users, Copy, Link2, Trash2, UserMinus, Crown, Loader2, Mail, UserPlus, Shield,
  User, Briefcase, ChevronDown, MapPin, Save,
} from 'lucide-react';
import { ProjectMemberPermissionsDialog } from './ProjectMemberPermissionsDialog';
import { OPTIONAL_TABS, TAB_LABELS } from '@/hooks/useProjectMemberPermissions';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ProjectMembersTabProps {
  projectId: string;
  members: ProjectMember[];
  invitations: ProjectInvitation[];
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
  projectStatus?: string;
  archivedAt?: string | null;
}

interface PermDialogState {
  open: boolean;
  userId: string;
  memberName: string;
}

interface BusinessProfileLite {
  id: string;
  company_name: string;
}

// Smart defaults per role
const defaultPermsForRole = (role: ProjectRole): Record<string, boolean> => {
  if (role === 'viewer') {
    return { overview: true, milestones: true, workers: false, collaborators: false, funding: false, transactions: false };
  }
  // member (and manager — but manager not invitable here)
  return { overview: true, milestones: true, workers: true, collaborators: true, funding: true, transactions: true };
};

export const ProjectMembersTab = ({
  projectId,
  members,
  invitations,
  isManager,
  loading,
  onRefetch,
  projectStatus,
  archivedAt,
}: ProjectMembersTabProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isProjectClosed =
    !!archivedAt || projectStatus === 'completed' || projectStatus === 'cancelled';
  const { updateMemberRole, removeMember, cancelInvitation, generateInviteLink, updateMemberContext } = useProjectMembers(projectId);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [suggestedContext, setSuggestedContext] = useState<'personal' | 'business'>('personal');
  const [permDialog, setPermDialog] = useState<PermDialogState>({ open: false, userId: '', memberName: '' });

  // Initial permissions UI state (owner-side, sent with invitation)
  const [permsOpen, setPermsOpen] = useState(false);
  const [initialPerms, setInitialPerms] = useState<Record<string, boolean>>(() => defaultPermsForRole('member'));

  // When inviteRole changes, reset perms to smart defaults for that role (only if user hasn't customized)
  const [permsTouched, setPermsTouched] = useState(false);
  useEffect(() => {
    if (!permsTouched) {
      setInitialPerms(defaultPermsForRole(inviteRole));
    }
  }, [inviteRole, permsTouched]);

  // Current member (self) — for "Move project" picker
  const currentMember = useMemo(
    () => members.find(m => m.user_id === user?.id),
    [members, user?.id]
  );
  const isOwnerInList = currentMember?.role === 'manager';

  // Self-relocation state
  const [businessProfiles, setBusinessProfiles] = useState<BusinessProfileLite[]>([]);
  const [selfContext, setSelfContext] = useState<'personal' | 'business'>('personal');
  const [selfBusinessProfileId, setSelfBusinessProfileId] = useState<string>('');
  const [savingContext, setSavingContext] = useState(false);

  // Load member's business profiles + initialize self context picker
  useEffect(() => {
    const loadProfiles = async () => {
      if (!user || isOwnerInList || !currentMember) return;
      const { data } = await supabase
        .from('business_profiles')
        .select('id, company_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      const list = (data || []) as BusinessProfileLite[];
      setBusinessProfiles(list);

      const ctx = (currentMember.member_context === 'business' ? 'business' : 'personal') as 'personal' | 'business';
      setSelfContext(ctx);
      const bpId = currentMember.member_business_profile_id || (list[0]?.id ?? '');
      setSelfBusinessProfileId(bpId);
    };
    loadProfiles();
  }, [user, currentMember, isOwnerInList]);

  const handleSaveSelfContext = async () => {
    if (selfContext === 'business' && !selfBusinessProfileId) {
      showError(t('projects.selectBusinessProfile', 'Odaberite poslovni profil ili odaberite Osobne financije.'));
      return;
    }
    setSavingContext(true);
    try {
      const ok = await updateMemberContext(
        selfContext,
        selfContext === 'business' ? selfBusinessProfileId : null
      );
      if (ok) onRefetch();
    } finally {
      setSavingContext(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const link = await generateInviteLink(inviteRole, suggestedContext, initialPerms);
      if (link) {
        setInviteLink(link);
      }
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      showSuccess(t('projects.linkCopied'));
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      showError(t('projects.enterEmail', t('toasts.enterEmail')));
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-member-invitation', {
        body: {
          type: 'project',
          targetId: projectId,
          invitedEmail: inviteEmail.trim(),
          role: inviteRole,
          suggestedContext,
          defaultPermissions: initialPerms,
        },
      });

      if (error) throw error;

      if (data.error) {
        if (data.error === 'user_not_found') {
          showError(t('projects.userNotFound', t('toasts.userNotFound')));
        } else if (data.error === 'already_member') {
          showError(t('projects.alreadyMember', t('toasts.alreadyMember')));
        } else if (data.error === 'already_invited') {
          showError(t('projects.alreadyInvited', t('toasts.alreadyInvited')));
        } else if (data.error === 'project_closed') {
          showError(t('projects.invitationsDisabledClosed', 'Projekt je završen ili arhiviran — pozivnice nisu moguće.'));
        } else {
          showError(data.message || t('common.error'));
        }
        return;
      }

      showSuccess(t('projects.invitationSent', t('toasts.invitationSent')));
      setInviteEmail('');
      onRefetch();
    } catch (error) {
      console.error('Error sending invitation:', error);
      showError(t('common.error'));
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (confirm(t('projects.confirmRemoveMember'))) {
      await removeMember(memberId);
      onRefetch();
    }
  };

  const handleRoleChange = async (memberId: string, newRole: ProjectRole) => {
    await updateMemberRole(memberId, newRole);
    onRefetch();
  };

  const handleCancelInvitation = async (invitationId: string) => {
    await cancelInvitation(invitationId);
    onRefetch();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Self relocation card — non-owner members only */}
      {currentMember && !isOwnerInList && (
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">
              {t('projects.yourLocation', 'Lokacija projekta kod tebe')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('projects.yourLocationHint', 'Odaberi gdje želiš da se ovaj projekt prikazuje u tvojoj aplikaciji.')}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={selfContext === 'personal' ? 'default' : 'outline'}
              size="sm"
              className="h-9 justify-start"
              onClick={() => setSelfContext('personal')}
            >
              <User className="w-4 h-4 mr-2" />
              {t('projects.contextPersonal', 'Osobne financije')}
            </Button>
            <Button
              type="button"
              variant={selfContext === 'business' ? 'default' : 'outline'}
              size="sm"
              className="h-9 justify-start"
              onClick={() => setSelfContext('business')}
              disabled={businessProfiles.length === 0}
            >
              <Briefcase className="w-4 h-4 mr-2" />
              {t('projects.contextBusiness', 'Poslovni mod')}
            </Button>
          </div>

          {selfContext === 'business' && businessProfiles.length > 0 && (
            <Select value={selfBusinessProfileId} onValueChange={setSelfBusinessProfileId}>
              <SelectTrigger>
                <SelectValue placeholder={t('projects.selectProfile', 'Odaberite profil')} />
              </SelectTrigger>
              <SelectContent>
                {businessProfiles.map(bp => (
                  <SelectItem key={bp.id} value={bp.id}>{bp.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selfContext === 'business' && businessProfiles.length === 0 && (
            <p className="text-xs text-destructive">
              {t('projects.noBusinessProfilesShort', 'Nemate poslovnih profila. Kreirajte ga u Postavkama.')}
            </p>
          )}

          <Button
            onClick={handleSaveSelfContext}
            disabled={savingContext}
            size="sm"
            className="w-full"
          >
            {savingContext ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t('projects.saveLocation', 'Spremi lokaciju')}
          </Button>
        </div>
      )}

      {/* Invite section - managers only */}
      {isManager && (
        <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            <span className="font-medium">{t('projects.inviteMembers')}</span>
          </div>

          {/* Context picker — where the project will appear for the invitee */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('projects.suggestedContext', 'Gdje će član vidjeti projekt?')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={suggestedContext === 'personal' ? 'default' : 'outline'}
                size="sm"
                className="h-9 justify-start"
                onClick={() => setSuggestedContext('personal')}
              >
                <User className="w-4 h-4 mr-2" />
                {t('projects.contextPersonal', 'Osobne financije')}
              </Button>
              <Button
                type="button"
                variant={suggestedContext === 'business' ? 'default' : 'outline'}
                size="sm"
                className="h-9 justify-start"
                onClick={() => setSuggestedContext('business')}
              >
                <Briefcase className="w-4 h-4 mr-2" />
                {t('projects.contextBusiness', 'Poslovni mod')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {suggestedContext === 'business'
                ? t('projects.contextBusinessHint', 'Član će prilikom prihvaćanja odabrati svoj poslovni profil.')
                : t('projects.contextPersonalHint', 'Projekt će se kod člana pojaviti u Osobnim financijama.')}
            </p>
          </div>

          {/* Initial permissions collapsible */}
          <Collapsible open={permsOpen} onOpenChange={setPermsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {t('projects.initialPermissions', 'Početne dozvole (opcionalno)')}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${permsOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('projects.initialPermissionsHint', 'Odaberi koje će kartice novi član vidjeti odmah po pristupu. Možeš mijenjati kasnije.')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {OPTIONAL_TABS.map(tab => (
                  <div key={tab} className="flex items-center gap-2 p-2 rounded border bg-card">
                    <Checkbox
                      id={`init-perm-${tab}`}
                      checked={initialPerms[tab] ?? false}
                      onCheckedChange={(checked) => {
                        setPermsTouched(true);
                        setInitialPerms(prev => ({ ...prev, [tab]: !!checked }));
                      }}
                    />
                    <label htmlFor={`init-perm-${tab}`} className="text-sm cursor-pointer flex-1">
                      {t(`projects.tab_${tab}`, TAB_LABELS[tab])}
                    </label>
                  </div>
                ))}
              </div>
              {permsTouched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPermsTouched(false);
                    setInitialPerms(defaultPermsForRole(inviteRole));
                  }}
                  className="text-xs"
                >
                  {t('projects.resetToDefaults', 'Vrati na zadane za ulogu')}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Email invitation */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('projects.inviteByEmail', 'Pozovi putem emaila')}</p>
            <div className="flex gap-2">
              <Input 
                type="email"
                placeholder={t('projects.emailPlaceholder', 'email@primjer.com')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as ProjectRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t(`projectRoles.member`, PROJECT_ROLE_LABELS.member)}</SelectItem>
                  <SelectItem value="viewer">{t(`projectRoles.viewer`, PROJECT_ROLE_LABELS.viewer)}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSendInvite} disabled={sendingInvite}>
                {sendingInvite ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('projects.inviteByEmailHint', 'Korisnik će dobiti obavijest u aplikaciji')}
            </p>
          </div>

          {/* Link invitation */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm text-muted-foreground">{t('projects.orGenerateLink', 'Ili generiraj pozivni link')}</p>
            <div className="flex gap-2">
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as ProjectRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t(`projectRoles.member`, PROJECT_ROLE_LABELS.member)}</SelectItem>
                  <SelectItem value="viewer">{t(`projectRoles.viewer`, PROJECT_ROLE_LABELS.viewer)}</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={handleGenerateLink} disabled={generatingLink} variant="outline" className="flex-1">
                {generatingLink ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                {t('projects.generateLink')}
              </Button>
            </div>

            {inviteLink && (
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="text-sm" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t('projects.inviteLinkExpires')}
            </p>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
          {t('projects.teamMembers')} ({members.length})
        </h4>

        {members.map((member) => (
          <div 
            key={member.id}
            className="p-3 rounded-lg border bg-card flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {member.display_name?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{member.display_name}</p>
                {member.role === 'manager' && (
                  <Crown className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`projectRoles.${member.role}`, PROJECT_ROLE_LABELS[member.role])}
              </p>
            </div>

            {isManager && member.role !== 'manager' && (
              <div className="flex items-center gap-2">
                <Select 
                  value={member.role} 
                  onValueChange={(v) => handleRoleChange(member.id, v as ProjectRole)}
                >
                  <SelectTrigger className="w-28 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t(`projectRoles.member`, PROJECT_ROLE_LABELS.member)}</SelectItem>
                    <SelectItem value="viewer">{t(`projectRoles.viewer`, PROJECT_ROLE_LABELS.viewer)}</SelectItem>
                  </SelectContent>
                </Select>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setPermDialog({ open: true, userId: member.user_id, memberName: member.display_name || '?' })}
                  title={t('projects.permissions', 'Dozvole')}
                >
                  <Shield className="w-4 h-4" />
                </Button>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleRemoveMember(member.id)}
                >
                  <UserMinus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {isManager && invitations.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-muted-foreground">
            {t('projects.pendingInvitations')} ({invitations.length})
          </h4>

          {invitations.map((invitation) => (
            <div 
              key={invitation.id}
              className="p-3 rounded-lg border bg-muted/30 flex items-center gap-3"
            >
              <div className="flex-1">
                <p className="text-sm">
                  {invitation.email === 'link-invite' 
                    ? t('projects.linkInvitation')
                    : invitation.email
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`projectRoles.${invitation.role}`, PROJECT_ROLE_LABELS[invitation.role])}
                </p>
              </div>
              
              <Badge variant="outline">{t('projects.pending')}</Badge>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive"
                onClick={() => handleCancelInvitation(invitation.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Permissions Dialog */}
      <ProjectMemberPermissionsDialog
        open={permDialog.open}
        onOpenChange={(open) => setPermDialog(prev => ({ ...prev, open }))}
        projectId={projectId}
        userId={permDialog.userId}
        memberName={permDialog.memberName}
      />
    </div>
  );
};
