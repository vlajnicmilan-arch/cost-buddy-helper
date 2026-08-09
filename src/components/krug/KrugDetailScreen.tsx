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
import { useState, useMemo, useEffect } from 'react';
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
import { Crown, Users, UserPlus, MoreVertical, Loader2, AlertCircle, Trash2, LogOut } from 'lucide-react';
import { useKrug, useKrugMembers, type KrugMemberView } from '@/hooks/useKrug';
import { KrugDeleteDialog } from './KrugDeleteDialog';
import { KrugLeaveDialog } from './KrugLeaveDialog';
import { KrugOwnerLeaveDialog } from './KrugOwnerLeaveDialog';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
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
import { KrugPendingInvitationsList } from './KrugPendingInvitationsList';
import { KrugApprovalQueue } from './KrugApprovalQueue';
import { KrugDecidedSection } from './KrugDecidedSection';
import { KrugLifecycleBadge } from './KrugLifecycleBadge';

import { KrugSharedSourcesSection } from './KrugSharedSourcesSection';
import { KrugSettlementSection } from './KrugSettlementSection';
import { TransactionDetailDialog } from '@/components/TransactionDetailDialog';
import { useKrugExpenseById } from '@/hooks/useKrugExpenseById';
import { clearPendingHighlight } from '@/lib/pendingHighlight';

import { canAddPunopravni } from '@/lib/krugPresets';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useModuleGate } from '@/hooks/useModuleGate';


interface Props {
  krugId: string;
  /** Pozvano nakon uspješnog samoizlaska — roditelj se vraća na listu. */
  onLeft?: () => void;
  /** Deep-link iz obavijesti: otvori pregled ove transakcije. */
  focusExpenseId?: string | null;
  /** Deep-link iz obavijesti: otkrij i istakni ovaj zapis podmirenja. */
  focusSettlementId?: string | null;
  onFocusConsumed?: () => void;
}

export function KrugDetailScreen({
  krugId,
  onLeft,
  focusExpenseId = null,
  focusSettlementId = null,
  onFocusConsumed,
}: Props) {
  const { t } = useTranslation();
  const [removeTarget, setRemoveTarget] = useState<KrugMemberView | null>(null);
  const { user } = useAuth();
  const { data: detail, isLoading } = useKrug(krugId);
  const { data: members = [] } = useKrugMembers(krugId);
  const { requestModule } = useModuleGate();
  const changeRole = useKrugChangeMemberRole();

  const removeMember = useKrugRemoveMember();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [ownerLeaveOpen, setOwnerLeaveOpen] = useState(false);
  const [focusDialogOpen, setFocusDialogOpen] = useState(false);

  // Deep link na transakciju iz obavijesti. Ako je trošak obrisan ili nije
  // vidljiv (RLS), tiho ostajemo na ekranu Kruga — bez greške i bez lažne
  // poruke iz HighlightTarget timeouta.
  const { data: focusExpense, isFetched: focusFetched } = useKrugExpenseById(focusExpenseId);
  useEffect(() => {
    if (!focusExpenseId) return;
    if (!focusFetched) return;
    if (focusExpense) {
      setFocusDialogOpen(true);
    } else {
      clearPendingHighlight();
      onFocusConsumed?.();
    }
  }, [focusExpenseId, focusFetched, focusExpense, onFocusConsumed]);

  const isOwner = !!(detail?.ownership && user && detail.ownership.user_id === user.id);
  const isFullMember = isOwner || detail?.myMembership?.role === 'punopravni';

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
  // Arhiva (`read_only`): povijest se čita, ništa se ne piše. Jedina dopuštena
  // radnja je brisanje cijele arhive — DB brana (`krug_assert_writable`) je
  // tvrda granica, ovdje samo sakrivamo akcije koje bi ionako pale.
  const isArchived = krug.lifecycle_state === 'read_only';
  const canPromoteToPunopravni = canAddPunopravni(krug.preset, punopravniCount);


  const handlePromote = async (m: KrugMemberView) => {
    let granted = false;
    requestModule('krug', { onGranted: () => { granted = true; } });
    if (!granted) return;
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
    let granted = false;
    requestModule('krug', { onGranted: () => { granted = true; } });
    if (!granted) return;
    if (!m.membership_id) return;
    try {
      await changeRole.mutateAsync({ krugId, membershipId: m.membership_id, role: 'obicni' });
      showSuccess(t('krug.member.role.demoted', 'Promijenjeno u običnog člana'));
    } catch (e) {
      showError(t('krug.member.role.error', 'Greška pri promjeni uloge'));
    }
  };

  const handleRemove = (m: KrugMemberView) => {
    let granted = false;
    requestModule('krug', { onGranted: () => { granted = true; } });
    if (!granted) return;
    if (!m.membership_id) return;
    setRemoveTarget(m);
  };

  const confirmRemove = async () => {
    if (!removeTarget?.membership_id) return;
    try {
      await removeMember.mutateAsync({ krugId, membershipId: removeTarget.membership_id });
      setRemoveTarget(null);
      showSuccess(t('krug.member.remove.success', 'Član uklonjen'));
    } catch (e) {
      showError(t('krug.member.remove.error', 'Greška pri uklanjanju člana'));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2" data-highlight-id={`krug:${krugId}`}>
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

      {/* Asimetrični samoizlazak: ne-vlasnik uvijek smije izaći, bez pristanka. */}
      {!isOwner && !!detail.myMembership && krug.lifecycle_state !== 'deleted' && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut className="w-4 h-4 mr-1" />
            {t('krug.leave.cta', 'Napusti Krug')}
          </Button>
        </div>
      )}

      {isOwner && krug.lifecycle_state !== 'deleted' && (
        <div className="flex flex-wrap justify-end gap-2">
          {/* Vlasnik ne može samo izaći — izlazak ide uz prijenos vlasništva. */}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
            onClick={() => setOwnerLeaveOpen(true)}
          >
            <LogOut className="w-4 h-4 mr-1" />
            {t('krug.ownerLeave.cta', 'Predaj vlasništvo i izađi')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
            onClick={() => requestModule('krug', { onGranted: () => setDeleteOpen(true) })}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {t('krug.delete.cta', 'Obriši Krug')}
          </Button>
        </div>
      )}

      <KrugDeletionVotePanel
        krugId={krugId}
        members={members}
        isOwner={isOwner}
        currentUserId={user?.id ?? null}
      />

      <KrugApprovalQueue
        krugId={krugId}
        viewerUserId={user?.id ?? null}
        viewerIsFullMember={
          isOwner || detail.myMembership?.role === 'punopravni'
        }
      />

      <KrugDecidedSection krugId={krugId} />






      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
            <Users className="w-4 h-4 text-module-muted" />
            {t('krug.members', 'Članovi')}
            <span className="text-xs text-muted-foreground">({members.length})</span>
          </h3>
          {isOwner && (
            <Button
              size="sm"
              onClick={() => requestModule('krug', { onGranted: () => setAddOpen(true) })}
              className="h-8"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              {t('krug.member.add.cta', 'Pozovi člana')}
            </Button>
          )}
        </div>

        {members.length <= 1 && (
          <Card className="p-4 text-xs text-muted-foreground">
            {isOwner
              ? t('krug.member.empty.owner', 'Krug još nema drugih članova. Pozovi nekoga preko “Pozovi člana”.')
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
                    variant="outline"
                    className="text-[10px] border-module text-module bg-transparent font-medium"
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

      <KrugPendingInvitationsList krugId={krugId} isOwner={isOwner} />

      <KrugSharedSourcesSection krugId={krugId} isOwner={isOwner} isFullMember={isFullMember} />

      <KrugSettlementSection
        krugId={krugId}
        isFullMember={!!isFullMember}
        isOwner={isOwner}
        focusSettlementId={focusSettlementId}
      />

      <TransactionDetailDialog
        expense={focusExpense ?? null}
        open={focusDialogOpen && !!focusExpense}
        onOpenChange={(open) => {
          setFocusDialogOpen(open);
          if (!open) onFocusConsumed?.();
        }}
        onEdit={() => { /* read-only ulaz iz obavijesti */ }}
        onDelete={() => {
          setFocusDialogOpen(false);
          onFocusConsumed?.();
        }}
      />



      <AddKrugMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        krugId={krugId}
        preset={krug.preset}
        punopravniCount={punopravniCount}
      />

      <KrugDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        krugId={krugId}
        krugName={krug.name}
        fullMemberCount={punopravniCount}
      />

      <KrugLeaveDialog
        krugId={krugId}
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeft={onLeft}
      />

      <KrugOwnerLeaveDialog
        krugId={krugId}
        members={members}
        open={ownerLeaveOpen}
        onOpenChange={setOwnerLeaveOpen}
        onLeft={onLeft}
      />

      <ConfirmActionDialog
        open={!!removeTarget}
        onOpenChange={(v) => { if (!v) setRemoveTarget(null); }}
        title={t('krug.member.remove.dialog.title', 'Ukloni člana')}
        description={t('krug.member.remove.dialog.description', 'Član gubi pristup Krugu i njegovim podacima.')}
        confirmLabel={t('krug.member.remove.dialog.confirm', 'Ukloni')}
        destructive
        pending={removeMember.isPending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
