import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentSourceMembers, PaymentSourceRole, PAYMENT_SOURCE_ROLE_LABELS } from '@/hooks/usePaymentSourceMembers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Users, Trash2, UserMinus, Crown, Loader2, Mail, UserPlus } from 'lucide-react';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface PaymentSourceMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentSource: CustomPaymentSource | null;
}

export const PaymentSourceMembersDialog = ({
  open,
  onOpenChange,
  paymentSource,
}: PaymentSourceMembersDialogProps) => {
  const { members, invitations, loading, isOwner, removeMember, cancelInvitation, refetch } = 
    usePaymentSourceMembers(paymentSource?.id || null);
  
  const [inviteEmail, setInviteEmail] = useState('');
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
          role: 'member',
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
              
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Član će moći vidjeti transakcije i stanje ovog računa
                </p>
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
                    className="w-10 h-10 rounded-full flex items-center justify-center"
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
                        <Crown className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_SOURCE_ROLE_LABELS[member.role]}
                    </p>
                  </div>

                  {isOwner && member.role !== 'owner' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive"
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
                      {PAYMENT_SOURCE_ROLE_LABELS[invitation.role]}
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
