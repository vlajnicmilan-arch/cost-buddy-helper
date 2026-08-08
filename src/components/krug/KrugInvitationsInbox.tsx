/**
 * KrugInvitationsInbox — „Pozvan si u Krug" kartice na /krug.
 *
 * Pozvani NIJE član dok ne prihvati: do tada ne vidi ništa osim naziva
 * Kruga, uloge i tko ga poziva (RPC `krug_list_my_invitations`).
 */
import { useTranslation } from 'react-i18next';
import { useShowMore } from '@/hooks/useShowMore';
import { ShowMoreButton } from '@/components/common/ShowMoreButton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MailOpen } from 'lucide-react';
import {
  useMyKrugInvitations,
  useAcceptKrugInvitation,
  useDeclineKrugInvitation,
  type KrugInviteDecisionError,
} from '@/hooks/useKrugInvitations';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import type { TFunction } from 'i18next';

export function translateInviteError(err: KrugInviteDecisionError | undefined, t: TFunction): string {
  switch (err) {
    case 'expired':
      return t('krug.invite.errors.expired', 'Pozivnica je istekla.');
    case 'not_pending':
      return t('krug.invite.errors.not_pending', 'Pozivnica više nije aktivna.');
    case 'not_found':
      return t('krug.invite.errors.not_found', 'Pozivnica ne postoji.');
    case 'not_invitee':
      return t('krug.invite.errors.not_invitee', 'Ova pozivnica nije za tebe.');
    case 'not_owner':
      return t('krug.invite.errors.not_owner', 'Samo vlasnik Kruga može povući pozivnicu.');
    case 'cap_exceeded':
      return t('krug.invite.errors.cap_exceeded', 'Krug je popunjen članovima s pravom odluke.');
    default:
      return t('krug.invite.errors.unexpected', 'Radnja nije uspjela. Pokušaj ponovno.');
  }
}

export function KrugInvitationsInbox() {
  const { t } = useTranslation();
  const { data: invitations = [], isLoading } = useMyKrugInvitations();
  const accept = useAcceptKrugInvitation();
  const decline = useDeclineKrugInvitation();
  const inboxList = useShowMore(invitations);

  if (isLoading || invitations.length === 0) return null;

  const handleAccept = async (invitationId: string, krugId: string) => {
    const res = await accept.mutateAsync({ invitationId, krugId });
    if (res.ok) showSuccess(t('krug.invite.accepted', 'Pridružio si se Krugu'));
    else showError(translateInviteError(res.error, t));
  };

  const handleDecline = async (invitationId: string, krugId: string) => {
    const res = await decline.mutateAsync({ invitationId, krugId });
    if (res.ok) showSuccess(t('krug.invite.declined', 'Pozivnica odbijena'));
    else showError(translateInviteError(res.error, t));
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
        <MailOpen className="w-4 h-4" />
        {t('krug.invite.inbox.title', 'Pozvan si u Krug')}
      </h3>

      {inboxList.visible.map((inv) => {
        const busy =
          (accept.isPending && accept.variables?.invitationId === inv.id) ||
          (decline.isPending && decline.variables?.invitationId === inv.id);
        return (
          <Card key={inv.id} className="p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{inv.krug_name}</p>
              <p className="text-xs text-muted-foreground">
                {t('krug.invite.inbox.byline', '{{inviter}} te poziva u ovaj Krug.', {
                  inviter: inv.inviter_name || t('krug.member.unknown', 'Nepoznat član'),
                })}
              </p>
              <Badge
                variant="outline"
                className="text-[10px] border-module text-module bg-transparent font-medium"
              >
                {t(`krug.role.${inv.role}`, inv.role)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                'krug.invite.inbox.consentHint',
                'Dok ne prihvatiš, nisi član i ne vidiš troškove ovog Kruga.',
              )}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 min-h-11"
                disabled={busy}
                onClick={() => void handleAccept(inv.id, inv.krug_id)}
              >
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('krug.invite.accept', 'Prihvati')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-h-11"
                disabled={busy}
                onClick={() => void handleDecline(inv.id, inv.krug_id)}
              >
                {t('krug.invite.decline', 'Odbij')}
              </Button>
            </div>
          </Card>
        );
      })}
      <ShowMoreButton hasMore={inboxList.hasMore} remaining={inboxList.remaining} onClick={inboxList.showMore} />
    </section>
  );
}
