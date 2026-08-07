/**
 * KrugPendingInvitationsList — vlasnikov pregled poslanih pozivnica.
 * Povlačenje ide kroz `krug_revoke_invitation` RPC (samo vlasnik, samo pending).
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock } from 'lucide-react';
import { useKrugPendingInvitations, useRevokeKrugInvitation } from '@/hooks/useKrugInvitations';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { translateInviteError } from './KrugInvitationsInbox';

interface Props {
  krugId: string;
  isOwner: boolean;
}

export function KrugPendingInvitationsList({ krugId, isOwner }: Props) {
  const { t } = useTranslation();
  const { data: invitations = [] } = useKrugPendingInvitations(krugId, isOwner);
  const revoke = useRevokeKrugInvitation();

  if (!isOwner || invitations.length === 0) return null;

  const handleRevoke = async (invitationId: string) => {
    const res = await revoke.mutateAsync({ invitationId, krugId });
    if (res.ok) showSuccess(t('krug.invite.revoked', 'Pozivnica povučena'));
    else showError(translateInviteError(res.error, t));
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
        <Clock className="w-4 h-4" />
        {t('krug.invite.pending.title', 'Poslane pozivnice')}
        <span className="text-xs text-muted-foreground">({invitations.length})</span>
      </h3>
      <Card className="divide-y divide-border">
        {invitations.map((inv) => {
          const busy = revoke.isPending && revoke.variables?.invitationId === inv.id;
          return (
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm truncate">{inv.email}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('krug.invite.pending.expires', 'Vrijedi do {{date}}', {
                    date: new Date(inv.expires_at).toLocaleDateString(),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant="outline"
                  className="text-[10px] border-module text-module bg-transparent font-medium"
                >
                  {t(`krug.role.${inv.role}`, inv.role)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => void handleRevoke(inv.id)}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('krug.invite.revoke', 'Povuci')
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}
