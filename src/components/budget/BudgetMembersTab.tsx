import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetMember, BudgetInvitation, BudgetRole, BUDGET_ROLE_LABELS } from '@/types/budgetMember';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Users, Copy, Link2, Trash2, UserMinus, Crown, Loader2 } from 'lucide-react';

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
      toast.success(t('budget.linkCopied', 'Link kopiran'));
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
        <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            <span className="font-medium">{t('budget.inviteMembers', 'Pozovi članove')}</span>
          </div>
          
          <div className="flex gap-2">
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as BudgetRole)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{BUDGET_ROLE_LABELS.member}</SelectItem>
                <SelectItem value="viewer">{BUDGET_ROLE_LABELS.viewer}</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={handleGenerateLink} disabled={generatingLink} className="flex-1">
              {generatingLink ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              {t('budget.generateLink', 'Generiraj link')}
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
            {t('budget.inviteLinkExpires', 'Link vrijedi 24 sata')}
          </p>
        </div>
      )}

      {/* Members list */}
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
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
                {BUDGET_ROLE_LABELS[member.role]}
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
                    <SelectItem value="member">{BUDGET_ROLE_LABELS.member}</SelectItem>
                    <SelectItem value="viewer">{BUDGET_ROLE_LABELS.viewer}</SelectItem>
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
                  {BUDGET_ROLE_LABELS[invitation.role]}
                </p>
              </div>
              
              <Badge variant="outline">{t('budget.pending', 'Na čekanju')}</Badge>
              
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
