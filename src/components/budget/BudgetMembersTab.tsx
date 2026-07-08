import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetMember, BudgetInvitation, BudgetRole, BUDGET_ROLE_LABELS } from '@/types/budgetMember';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Users, Copy, Link2, Trash2, UserMinus, Crown, Loader2, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invitationErrorMessage } from '@/lib/invitationErrors';

interface BudgetMembersTabProps {
  budgetId: string;
  members: BudgetMember[];
  invitations: BudgetInvitation[];
  isOwner: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const BudgetMembersTab = ({
  budgetId,
  members,
  invitations,
  isOwner,
  loading,
  onRefetch
}: BudgetMembersTabProps) => {
  const { t } = useTranslation();
  const { updateMemberRole, removeMember, cancelInvitation, generateInviteLink } = useBudgetMembers(budgetId);
  
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [inviteRole, setInviteRole] = useState<BudgetRole>('member');
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
      showSuccess(t('budget.linkCopied', 'Link kopiran'));
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      showError(t('budget.enterEmail', t('toasts.enterEmail')));
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-member-invitation', {
        body: {
          type: 'budget',
          targetId: budgetId,
          invitedEmail: inviteEmail.trim(),
          role: inviteRole,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        showError(invitationErrorMessage(data.error, data.message));
        return;
      }

      showSuccess(t('budget.invitationSent', t('toasts.invitationSent')));
      setInviteEmail('');
      onRefetch();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      const msg = error?.message || error?.context?.body?.message || t('common.error');
      showError(msg);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (confirm(t('budget.confirmRemoveMember', 'Jeste li sigurni da želite ukloniti ovog člana?'))) {
      await removeMember(memberId);
      onRefetch();
    }
  };

  const handleRoleChange = async (memberId: string, newRole: BudgetRole) => {
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
      {/* Invite section - owner only */}
      {isOwner && (
        <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-module-muted" />
            <span className="font-medium text-module-muted">{t('budget.inviteMembers')}</span>
          </div>
          
          {/* Email invitation */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('budget.inviteByEmail')}</p>
            <div className="flex gap-2">
              <Input 
                type="email"
                placeholder={t('budget.emailPlaceholder')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as BudgetRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t('budgetRoles.member', 'Član')}</SelectItem>
                  <SelectItem value="viewer">{t('budgetRoles.viewer', 'Gledatelj')}</SelectItem>
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
              {t('budget.inviteByEmailHint')}
            </p>
          </div>

          {/* Link invitation */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm text-muted-foreground">{t('budget.orGenerateLink')}</p>
            <div className="flex gap-2">
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as BudgetRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t('budgetRoles.member', 'Član')}</SelectItem>
                  <SelectItem value="viewer">{t('budgetRoles.viewer', 'Gledatelj')}</SelectItem>
                </SelectContent>
              </Select>
              
              <Button onClick={handleGenerateLink} disabled={generatingLink} variant="outline" className="flex-1">
                {generatingLink ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                {t('budget.generateLink')}
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
              {t('budget.inviteLinkExpires')}
            </p>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2 text-module-muted">
          <Users className="w-4 h-4 text-module-muted" />
          {t('budget.members', 'Članovi')} ({members.length})
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
                {member.role === 'owner' && (
                  <Crown className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(`budgetRoles.${member.role}`, BUDGET_ROLE_LABELS[member.role])}
              </p>
            </div>

            {isOwner && member.role !== 'owner' && (
              <div className="flex items-center gap-2">
                <Select 
                  value={member.role} 
                  onValueChange={(v) => handleRoleChange(member.id, v as BudgetRole)}
                >
                  <SelectTrigger className="w-28 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t('budgetRoles.member', 'Član')}</SelectItem>
                    <SelectItem value="viewer">{t('budgetRoles.viewer', 'Gledatelj')}</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 min-h-[44px] min-w-[44px] touch-manipulation text-destructive"
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
      {isOwner && invitations.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-muted-foreground">
            {t('budget.pendingInvitations', 'Aktivne pozivnice')} ({invitations.length})
          </h4>

          {invitations.map((invitation) => (
            <div 
              key={invitation.id}
              className="p-3 rounded-lg border bg-muted/30 flex items-center gap-3"
            >
              <div className="flex-1">
                <p className="text-sm">
                  {invitation.email === 'link-invite' 
                    ? t('budget.linkInvitation', 'Pozivni link')
                    : invitation.email
                  }
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`budgetRoles.${invitation.role}`, BUDGET_ROLE_LABELS[invitation.role])}
                </p>
              </div>
              
              <Badge variant="outline">{t('budget.pending', 'Na čekanju')}</Badge>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 min-h-[44px] min-w-[44px] touch-manipulation text-destructive"
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
