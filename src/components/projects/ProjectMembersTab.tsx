import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectMember, ProjectInvitation, ProjectRole, PROJECT_ROLE_LABELS } from '@/types/project';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Users, Copy, Link2, Trash2, UserMinus, Crown, Loader2, Mail, UserPlus, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectMemberPermissionsDialog } from './ProjectMemberPermissionsDialog';
import { supabase } from '@/integrations/supabase/client';

interface ProjectMembersTabProps {
  projectId: string;
  members: ProjectMember[];
  invitations: ProjectInvitation[];
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

interface PermDialogState {
  open: boolean;
  userId: string;
  memberName: string;
}



export const ProjectMembersTab = ({
  projectId,
  members,
  invitations,
  isManager,
  loading,
  onRefetch
}: ProjectMembersTabProps) => {
  const { t } = useTranslation();
  const { updateMemberRole, removeMember, cancelInvitation, generateInviteLink } = useProjectMembers(projectId);
  
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const link = await generateInviteLink(inviteRole);
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
      toast.success(t('projects.linkCopied'));
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error(t('projects.enterEmail', t('toasts.enterEmail')));
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
        },
      });

      if (error) throw error;
      
      if (data.error) {
        if (data.error === 'user_not_found') {
          toast.error(t('projects.userNotFound', t('toasts.userNotFound')));
        } else if (data.error === 'already_member') {
          toast.error(t('projects.alreadyMember', t('toasts.alreadyMember')));
        } else if (data.error === 'already_invited') {
          toast.error(t('projects.alreadyInvited', t('toasts.alreadyInvited')));
        } else {
          toast.error(data.message || t('common.error'));
        }
        return;
      }

      toast.success(t('projects.invitationSent', t('toasts.invitationSent')));
      setInviteEmail('');
      onRefetch();
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error(t('common.error'));
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
      {/* Invite section - managers only */}
      {isManager && (
        <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            <span className="font-medium">{t('projects.inviteMembers')}</span>
          </div>
          
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
                  <SelectItem value="member">{PROJECT_ROLE_LABELS.member}</SelectItem>
                  <SelectItem value="viewer">{PROJECT_ROLE_LABELS.viewer}</SelectItem>
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
                  <SelectItem value="member">{PROJECT_ROLE_LABELS.member}</SelectItem>
                  <SelectItem value="viewer">{PROJECT_ROLE_LABELS.viewer}</SelectItem>
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
                {PROJECT_ROLE_LABELS[member.role]}
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
                    <SelectItem value="member">{PROJECT_ROLE_LABELS.member}</SelectItem>
                    <SelectItem value="viewer">{PROJECT_ROLE_LABELS.viewer}</SelectItem>
                  </SelectContent>
                </Select>
                
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
                  {PROJECT_ROLE_LABELS[invitation.role]}
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
    </div>
  );
};
