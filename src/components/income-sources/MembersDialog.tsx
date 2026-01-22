import { useIncomeSourceMembers } from '@/hooks/useIncomeSourceMembers';
import { usePendingTransactions } from '@/hooks/usePendingTransactions';
import { IncomeSource } from '@/types/incomeSource';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Crown, 
  UserMinus, 
  Loader2, 
  Clock, 
  Check, 
  X,
  Mail,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface MembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSource | null;
}

export const MembersDialog = ({ open, onOpenChange, source }: MembersDialogProps) => {
  const { 
    members, 
    invitations, 
    loading, 
    isOwner, 
    removeMember, 
    cancelInvitation 
  } = useIncomeSourceMembers(source?.id || null);
  
  const { 
    pendingTransactions, 
    loading: pendingLoading, 
    approveTransaction, 
    rejectTransaction,
    pendingCount
  } = usePendingTransactions(source?.id || null);

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (!source) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{source.icon || '💰'}</span>
            <span>{source.name}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="members" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members" className="gap-1">
              <Users className="w-4 h-4" />
              Članovi ({members.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1">
              <Clock className="w-4 h-4" />
              Na čekanju
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="flex-1 overflow-auto space-y-4 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Members List */}
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {member.role === 'owner' ? (
                            <Crown className="w-5 h-5 text-amber-500" />
                          ) : (
                            <Users className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.display_name || 'Korisnik'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.role === 'owner' ? 'Vlasnik' : 'Član'} • Pridružen {format(new Date(member.joined_at), 'd. MMM yyyy', { locale: hr })}
                          </p>
                        </div>
                      </div>
                      {isOwner && member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeMember(member.id)}
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {members.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Nema članova</p>
                    </div>
                  )}
                </div>

                {/* Pending Invitations */}
                {isOwner && invitations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Pozivnice na čekanju
                    </h4>
                    {invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <Mail className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{invitation.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Istječe {format(new Date(invitation.expires_at), 'd. MMM yyyy', { locale: hr })}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => cancelInvitation(invitation.id)}
                        >
                          Otkaži
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Member Info */}
                {isOwner && (
                  <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Pozivanje članova</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Funkcija email pozivnica bit će dostupna uskoro. Za sada možete ručno dodati članove.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Pending Transactions Tab */}
          <TabsContent value="pending" className="flex-1 overflow-auto space-y-3 mt-4">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-3 opacity-30 text-income" />
                <p>Sve transakcije su odobrene</p>
                <p className="text-sm mt-1">Nema novih zahtjeva za odobrenje</p>
              </div>
            ) : (
              pendingTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-4 rounded-xl border bg-card space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{transaction.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(transaction.date, 'd. MMM yyyy', { locale: hr })}
                      </p>
                    </div>
                    <span className={cn(
                      "font-mono font-bold",
                      transaction.type === 'income' ? 'text-income' : 'text-expense'
                    )}>
                      {transaction.type === 'income' ? '+' : '-'}
                      {formatAmount(transaction.amount)}
                    </span>
                  </div>

                  {isOwner && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => approveTransaction(transaction.id)}
                      >
                        <Check className="w-4 h-4" />
                        Odobri
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => rejectTransaction(transaction.id)}
                      >
                        <X className="w-4 h-4" />
                        Odbij
                      </Button>
                    </div>
                  )}

                  {!isOwner && (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="w-3 h-3" />
                      Čeka odobrenje vlasnika
                    </Badge>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
