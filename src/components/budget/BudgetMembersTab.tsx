import { useState } from 'react';
import { useBudgetMembers } from '@/hooks/useBudgetMembers';
import { BUDGET_ROLE_LABELS, BudgetMemberRole } from '@/types/budget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2, Users, Mail, Copy, Check, X, Crown, User, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetMembersTabProps {
  budgetId: string;
  isOwner: boolean;
}

export const BudgetMembersTab = ({ budgetId, isOwner }: BudgetMembersTabProps) => {
  const { t } = useTranslation();
  const { members, invitations, loading, inviteMember, removeMember, updateMemberRole, cancelInvitation } = useBudgetMembers(budgetId);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'viewer'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) return;

    const token = await inviteMember(email.trim(), role);
    if (token) {
      const link = `${window.location.origin}/join-budget/${token}`;
      setInviteLink(link);
      setEmail('');
    }
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success(t('budget.linkCopied', 'Link kopiran'));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-amber-500" />;
      case 'member': return <User className="w-4 h-4 text-blue-500" />;
      case 'viewer': return <Eye className="w-4 h-4 text-gray-500" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('budget.teamMembers', 'Članovi tima')}</h3>
        {isOwner && (
          <Button onClick={() => { setInviteDialogOpen(true); setInviteLink(null); }} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('budget.invite', 'Pozovi')}
          </Button>
        )}
      </div>

      {/* Current Members */}
      <div className="space-y-2">
        {members.map((member) => (
          <Card key={member.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  {getRoleIcon(member.role)}
                </div>
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <Badge variant="secondary" className="text-xs">
                    {BUDGET_ROLE_LABELS[member.role as BudgetMemberRole]}
                  </Badge>
                </div>
              </div>

              {isOwner && member.role !== 'owner' && (
                <div className="flex gap-2">
                  <Select
                    value={member.role}
                    onValueChange={(v) => updateMemberRole(member.id, v as 'member' | 'viewer')}
                  >
                    <SelectTrigger className="w-32">
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
                    onClick={() => removeMember(member.id)}
                  >
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{t('budget.pendingInvitations', 'Pozivnice na čekanju')}</h4>
          {invitations.map((inv) => (
            <Card key={inv.id} className="border-dashed">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {BUDGET_ROLE_LABELS[inv.role as BudgetMemberRole]}
                    </p>
                  </div>
                </div>
                {isOwner && (
                  <Button variant="ghost" size="icon" onClick={() => cancelInvitation(inv.id)}>
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {members.length <= 1 && invitations.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('budget.noMembers', 'Još nema članova')}</p>
          <p className="text-sm">{t('budget.noMembersHint', 'Pozovi ljude za zajedničko planiranje')}</p>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('budget.inviteMember', 'Pozovi člana')}</DialogTitle>
          </DialogHeader>

          {inviteLink ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('budget.shareLink', 'Podijeli ovaj link s osobom koju želiš pozvati:')}
              </p>
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="text-sm" />
                <Button onClick={copyLink} variant="outline" size="icon">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setInviteDialogOpen(false)}>
                  {t('common.done', 'Gotovo')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('common.email', 'Email')}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ime@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label>{t('common.role', 'Uloga')}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'member' | 'viewer')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">
                      <span className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {BUDGET_ROLE_LABELS.member}
                      </span>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <span className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        {BUDGET_ROLE_LABELS.viewer}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  {t('common.cancel', 'Odustani')}
                </Button>
                <Button onClick={handleInvite}>
                  {t('budget.sendInvite', 'Pošalji pozivnicu')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
