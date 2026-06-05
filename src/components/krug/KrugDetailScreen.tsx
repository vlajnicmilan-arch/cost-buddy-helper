/**
 * Krug detail — članovi, shared payment sources.
 *
 * Wave 2 dodano:
 * - vlasnik dodaje članove (AddKrugMemberDialog → krug-add-member edge fn)
 * - vlasnik mijenja ulogu (punopravni ↔ obicni) direktno preko RLS-a
 * - vlasnik uklanja članove (RLS: krug_membership_delete_owner_not_self)
 *
 * Owner se NE prikazuje kao membership row — vodi se kroz `krug_ownership`.
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Crown, Users, UserPlus, MoreVertical, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { useKrug, useKrugMembers, type KrugMemberView } from '@/hooks/useKrug';
import { KrugDeleteDialog } from './KrugDeleteDialog';
import { KrugDeletionVotePanel } from './KrugDeletionVotePanel';
import {
  useKrugChangeMemberRole,
  useKrugRemoveMember,
  isKrugCapError,
} from '@/hooks/useKrugMemberMutations';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName, getInitials } from '@/lib/krugDisplay';
import { AddKrugMemberDialog } from './AddKrugMemberDialog';
import { KrugApprovalQueue } from './KrugApprovalQueue';
import { KrugLifecycleBadge } from './KrugLifecycleBadge';

import { KrugSharedSourcesSection } from './KrugSharedSourcesSection';
import { canAddPunopravni } from '@/lib/krugPresets';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';


interface Props {
  krugId: string;
}

export function KrugDetailScreen({ krugId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: detail, isLoading } = useKrug(krugId);
  const { data: members = [] } = useKrugMembers(krugId);
  const changeRole = useKrugChangeMemberRole();

  const removeMember = useKrugRemoveMember();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOwner = !!(detail?.ownership && user && detail.ownership.user_id === user.id);
  const punopravniCount = useMemo(
    () => members.filter((m) => m.kind === 'owner' || m.kind === 'punopravni').length,
    [members],
  );
  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);
  const profileMap = useUserProfiles(memberIds);

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Učitavanje…')}</Card>;
  }
  if (!detail) {
    return (
      <Card className="p-6 space-y-2 border-destructive/30">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertCircle className="w-4 h-4" />
          {t('krug.notFound', 'Krug ne postoji.')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'krug.notFoundBody',
            'Možda je obrisan ili više nemaš pristup. Vrati se na listu Krugova.',
          )}
        </p>
      </Card>
    );
  }

  const { krug } = detail;
  const canPromoteToPunopravni = canAddPunopravni(krug.preset, punopravniCount);

  const handlePromote = async (m: KrugMemberView) => {
    if (!m.membership_id) return;
    try {
      await changeRole.mutateAsync({ krugId, membershipId: m.membership_id, role: 'punopravni' });
      showSuccess(t('krug.member.role.promoted', 'Promovirano u punopravnog člana'));
    } catch (e) {
      if (isKrugCapError(e)) {
        showError(t('krug.member.add.errors.cap_exceeded', 'Dosegnut je maks. broj punopravnih članova za ovaj preset.'));
      } else {
        showError(t('krug.member.role.error', 'Greška pri promjeni uloge'));
      }
    }
  };

  const handleDemote = async (m: KrugMemberView) => {
    if (!m.membership_id) return;
    try {
      await changeRole.mutateAsync({ krugId, membershipId: m.membership_id, role: 'obicni' });
      showSuccess(t('krug.member.role.demoted', 'Promijenjeno u običnog člana'));
    } catch (e) {
      showError(t('krug.member.role.error', 'Greška pri promjeni uloge'));
    }
  };

  const handleRemove = async (m: KrugMemberView) => {
    if (!m.membership_id) return;
    const ok = window.confirm(t('krug.member.remove.confirm', 'Ukloniti člana iz Kruga?'));
    if (!ok) return;
    try {
      await removeMember.mutateAsync({ krugId, membershipId: m.membership_id });
      showSuccess(t('krug.member.remove.success', 'Član uklonjen'));
    } catch (e) {
      showError(t('krug.member.remove.error', 'Greška pri uklanjanju člana'));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold truncate">{krug.name}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {t(`krug.preset.${krug.preset}`, krug.preset)}
            </p>
          </div>
          <KrugLifecycleBadge state={krug.lifecycle_state} className="shrink-0 text-right" />
        </div>
        
        {krug.lifecycle_state && krug.lifecycle_state !== 'active' && (
          <p className="text-[11px] text-muted-foreground">
            {t(`krug.lifecycleNote.${krug.lifecycle_state}`, { defaultValue: '' })}
          </p>
        )}
      </Card>

      <KrugApprovalQueue
        krugId={krugId}
        viewerUserId={user?.id ?? null}
        viewerIsFullMember={
          isOwner || detail.myMembership?.role === 'punopravni'
        }
      />



      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('krug.members', 'Članovi')}
            <span className="text-xs text-muted-foreground">({members.length})</span>
          </h3>
          {isOwner && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="h-8">
              <UserPlus className="w-4 h-4 mr-1" />
              {t('krug.member.add.cta', 'Dodaj člana')}
            </Button>
          )}
        </div>

        {members.length <= 1 && (
          <Card className="p-4 text-xs text-muted-foreground">
            {isOwner
              ? t('krug.member.empty.owner', 'Krug još nema drugih članova. Pozovi nekoga preko “Dodaj člana”.')
              : t('krug.member.empty.member', 'Krug još nema drugih članova.')}
          </Card>
        )}

        <Card className="divide-y divide-border">

          {members.map((m) => {
            const isMe = user?.id === m.user_id;
            const canManage = isOwner && m.kind !== 'owner';
            const busy =
              (changeRole.isPending && changeRole.variables?.membershipId === m.membership_id) ||
              (removeMember.isPending && removeMember.variables?.membershipId === m.membership_id);

            const profile = profileMap.get(m.user_id);
            const displayName = getMemberDisplayName(
              profile,
              m.user_id,
              t('krug.member.unknown', 'Nepoznat član'),
            );
            const initials = getInitials(profile?.display_name || '', m.user_id);

            return (
              <div
                key={`${m.user_id}-${m.kind}`}
                className="px-4 py-3 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3 text-sm min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-[10px] font-medium bg-muted">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium truncate">{displayName}</span>
                      {isMe && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          ({t('krug.member.you', 'ti')})
                        </span>
                      )}
                    </div>
                    {m.kind === 'owner' && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Crown className="w-3 h-3 text-primary" />
                        {t('krug.role.owner', 'Vlasnik')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={m.kind === 'punopravni' || m.kind === 'owner' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {t(
                      `krug.role.${m.kind === 'owner' ? 'punopravni' : m.kind}`,
                      m.kind === 'owner' ? 'punopravni' : m.kind,
                    )}
                  </Badge>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
                          {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreVertical className="w-4 h-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {m.kind === 'obicni' ? (
                          <DropdownMenuItem
                            disabled={!canPromoteToPunopravni}
                            onClick={() => handlePromote(m)}
                          >
                            {t('krug.member.actions.promote', 'Promoviraj u punopravnog')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleDemote(m)}>
                            {t('krug.member.actions.demote', 'Vrati na običnog')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleRemove(m)}
                        >
                          {t('krug.member.actions.remove', 'Ukloni iz Kruga')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      <KrugSharedSourcesSection krugId={krugId} isOwner={isOwner} />



      <AddKrugMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        krugId={krugId}
        preset={krug.preset}
        punopravniCount={punopravniCount}
      />
    </div>
  );
}
