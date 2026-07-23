/**
 * Panel s pending zahtjevom za brisanje. Prikazuje napredak glasova,
 * dopušta punopravnim članovima glasanje, vlasniku povlačenje zahtjeva.
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, X, Loader2, Trash2 } from 'lucide-react';
import {
  useKrugDeletionRequest,
  useKrugVoteDeletion,
  useKrugCancelDeletion,
} from '@/hooks/useKrugDeletion';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import type { KrugMemberView } from '@/hooks/useKrug';
import { useModuleGate } from '@/hooks/useModuleGate';

interface Props {
  krugId: string;
  members: KrugMemberView[];
  isOwner: boolean;
  currentUserId: string | null;
}

export function KrugDeletionVotePanel({ krugId, members, isOwner, currentUserId }: Props) {
  const { t } = useTranslation();
  const { data } = useKrugDeletionRequest(krugId);
  const vote = useKrugVoteDeletion();
  const cancel = useKrugCancelDeletion();
  const { requestModule } = useModuleGate();

  const fullMembers = members.filter((m) => m.kind === 'owner' || m.kind === 'punopravni');
  const ids = [...new Set([...(data?.request ? [data.request.initiated_by] : []), ...fullMembers.map((m) => m.user_id)])];
  const profiles = useUserProfiles(ids);

  if (!data?.request) return null;
  const req = data.request;
  const votes = data.votes;

  const approveCount = votes.filter((v) => v.approve).length;
  const total = fullMembers.length;
  const myVote = currentUserId ? votes.find((v) => v.user_id === currentUserId) : null;
  const amFullMember = !!currentUserId && fullMembers.some((m) => m.user_id === currentUserId);
  const firstReject = votes.find((v) => !v.approve) ?? null;
  const rejectorName = firstReject
    ? getMemberDisplayName(profiles.get(firstReject.user_id), firstReject.user_id, t('krug.member.unknown', 'Nepoznat član'))
    : null;

  const initiatorName = getMemberDisplayName(
    profiles.get(req.initiated_by),
    req.initiated_by,
    t('krug.member.unknown', 'Nepoznat član'),
  );

  return (
    <Card className="p-4 space-y-3 border-destructive/40 bg-destructive/5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('krug.delete.votePanel.title', 'Zahtjev za brisanje')}</div>
          <div className="text-xs text-muted-foreground">
            {t('krug.delete.votePanel.subtitle', { name: initiatorName })}
          </div>
          {req.reason && (
            <div className="text-xs text-muted-foreground mt-1">
              {t('krug.delete.votePanel.reason', { reason: req.reason })}
            </div>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {t('krug.delete.votePanel.progress', { approved: approveCount, total })}
        </Badge>
      </div>

      {rejectorName ? (
        <div className="text-xs text-destructive">
          {t('krug.delete.votePanel.statusHintRejected', { name: rejectorName })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {t('krug.delete.votePanel.statusHint', { approved: approveCount, total })}
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        {t('krug.delete.votePanel.timeoutNote', 'Zahtjev ostaje otvoren dok ga vlasnik ne povuče ili svi ne odluče.')}
      </div>

      <div className="space-y-1.5">
        {fullMembers.map((m) => {
          const v = votes.find((x) => x.user_id === m.user_id);
          const name = getMemberDisplayName(profiles.get(m.user_id), m.user_id, t('krug.member.unknown', 'Nepoznat član'));
          return (
            <div key={m.user_id} className="flex items-center justify-between text-xs">
              <span className="truncate">{name}</span>
              {v ? (
                v.approve ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <X className="w-4 h-4 text-destructive" />
                )
              ) : (
                <span className="text-muted-foreground">{t('krug.delete.votePanel.pending', 'Čeka glas')}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {amFullMember && !myVote && (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => requestModule('krug', {
                onGranted: () => vote.mutate({ krugId, approve: true }),
              })}
              disabled={vote.isPending}
              className="gap-1.5"
            >
              {vote.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              {t('krug.delete.votePanel.approve', 'Glasam za brisanje')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestModule('krug', {
                onGranted: () => vote.mutate({ krugId, approve: false }),
              })}
              disabled={vote.isPending}
            >
              {t('krug.delete.votePanel.reject', 'Protiv brisanja')}
            </Button>
          </>
        )}
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => requestModule('krug', {
              onGranted: () => cancel.mutate({ krugId }),
            })}
            disabled={cancel.isPending}
            className="ml-auto"
          >
            {cancel.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {t('krug.delete.votePanel.withdraw', 'Povuci zahtjev')}
          </Button>
        )}
      </div>
    </Card>
  );
}
