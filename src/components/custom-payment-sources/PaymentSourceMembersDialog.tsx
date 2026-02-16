import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentSourceMembers, PaymentSourceRole, PAYMENT_SOURCE_ROLE_LABELS } from '@/hooks/usePaymentSourceMembers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Trash2, UserMinus, Crown, Loader2, Mail, UserPlus, Eye, Edit3 } from 'lucide-react';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface PaymentSourceMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentSource: CustomPaymentSource | null;
}

const INVITE_ROLE_OPTIONS: { value: 'limited' | 'full'; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'limited', label: 'Ograničeni', description: 'Može samo knjižiti transakcije, vidi samo svoje', icon: <Edit3 className="w-4 h-4" /> },
  { value: 'full', label: 'Potpuni pristup', description: 'Može knjižiti i vidi sve transakcije na računu', icon: <Eye className="w-4 h-4" /> },
];

export const PaymentSourceMembersDialog = ({
  open,
  onOpenChange,
  paymentSource,
}: PaymentSourceMembersDialogProps) => {
  const { members, invitations, loading, isOwner, removeMember, updateMemberRole, cancelInvitation, refetch } = 
    usePaymentSourceMembers(paymentSource?.id || null);
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'limited' | 'full'>('limited');
  const [sendingInvite, setSendingInvite] = useState(false);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !paymentSource) {
      toast.error('Unesite email adresu');
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-member-invitation', {
        body: {
          type: 'payment_source',
          targetId: paymentSource.id,
          invitedEmail: inviteEmail.trim(),
          role: inviteRole,
        },
      });

      if (error) throw error;
      
      if (data.error) {
        if (data.error === 'user_not_found') {
          toast.error('Korisnik s tim emailom nije pronađen');
        } else if (data.error === 'already_member') {
          toast.error('Korisnik je već član');
        } else if (data.error === 'already_invited') {
          toast.error('Korisnik već ima aktivnu pozivnicu');
        } else {
          toast.error(data.message || 'Greška');
        }
        return;
      }

      toast.success('Pozivnica poslana');
      setInviteEmail('');
      refetch();
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error('Greška pri slanju pozivnice');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (confirm('Jeste li sigurni da želite ukloniti ovog člana?')) {
      await removeMember(memberId);
      refetch();
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    await cancelInvitation(invitationId);
    refetch();
  };

  const getEffectiveRoleLabel = (role: PaymentSourceRole) => {
    if (role === 'owner') return 'Vlasnik';
    if (role === 'full') return 'Potpuni pristup';
    return 'Ograničeni'; // 'limited' or legacy 'member'
  };

  if (!paymentSource) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Članovi računa "{paymentSource.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Invite section - owner only */}
          {isOwner && (
            <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                <span className="font-medium">Pozovi člana</span>
              </div>
              
              <div className="space-y-3">
                {/* Role selector */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Razina pristupa</p>
                  <div className="grid grid-cols-2 gap-2">
                    {INVITE_ROLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setInviteRole(option.value)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          inviteRole === option.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {option.icon}
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input 
                    type="email"
                    placeholder="email@primjer.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                  />
                  <Button onClick={handleSendInvite} disabled={sendingInvite}>
                    {sendingInvite ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Korisnik će dobiti push obavijest u aplikaciji
                </p>
              </div>
            </div>
          )}

          {/* Members list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Članovi ({members.length})
              </h4>

              {members.map((member) => (
                <div 
                  key={member.id}
                  className="p-3 rounded-lg border bg-card flex items-center gap-3"
                >
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: paymentSource.color + '20' }}
                  >
                    <span className="text-sm font-medium" style={{ color: paymentSource.color }}>
                      {member.display_name?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.display_name}</p>
                      {member.role === 'owner' && (
                        <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                    </div>
                    {member.role === 'owner' ? (
                      <p className="text-xs text-muted-foreground">Vlasnik</p>
                    ) : isOwner ? (
                      <Select
                        value={member.role === 'member' ? 'limited' : member.role}
                        onValueChange={(value) => updateMemberRole(member.id, value as PaymentSourceRole)}
                      >
                        <SelectTrigger className="h-7 text-xs w-auto min-w-[140px] border-dashed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="limited">
                            <span className="flex items-center gap-1.5">
                              <Edit3 className="w-3 h-3" /> Ograničeni
                            </span>
                          </SelectItem>
                          <SelectItem value="full">
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3 h-3" /> Potpuni pristup
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {getEffectiveRoleLabel(member.role)}
                      </p>
                    )}
                  </div>

                  {isOwner && member.role !== 'owner' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {isOwner && invitations.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-muted-foreground">
                Aktivne pozivnice ({invitations.length})
              </h4>

              {invitations.map((invitation) => (
                <div 
                  key={invitation.id}
                  className="p-3 rounded-lg border bg-muted/30 flex items-center gap-3"
                >
                  <div className="flex-1">
                    <p className="text-sm">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {getEffectiveRoleLabel(invitation.role)}
                    </p>
                  </div>
                  
                  <Badge variant="outline">Na čekanju</Badge>
                  
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

          {/* Legend */}
          <div className="p-3 rounded-lg bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Razine pristupa</p>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-xs">
                <Edit3 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span><strong>Ograničeni</strong> — može knjižiti transakcije, vidi samo svoje</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Eye className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span><strong>Potpuni pristup</strong> — može knjižiti i vidi sve transakcije na računu</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
