/**
 * Inline panel za override podjele u ExpenseEdit sloju.
 * Progresivno otkrivanje: sažeti pregled → forma za novi prijedlog.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Check, X, Undo2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useKrugMembers } from '@/hooks/useKrug';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import {
  useKrugExpenseOverride,
  useKrugProposeOverride,
  useKrugConfirmOverride,
  useKrugRejectOverride,
  useKrugWithdrawOverride,
  type OverrideShare,
} from '@/hooks/useKrugExpenseOverride';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { KrugSharedOfLine } from './KrugSharedAmount';
import { KrugSplitShareEditor } from './KrugSplitShareEditor';


interface Props {
  krugId: string;
  expenseId: string;
  isFullMember: boolean;
  /** Obični član: vidi samo prijedloge u kojima ima udio, potvrđuje/odbija, ne predlaže. */
  isRegularMember?: boolean;
  /** Read-only kontekst (pregled transakcije) ne nudi kreiranje prijedloga. */
  allowPropose?: boolean;
  /** Iznos i valuta troška — za "Dijeli samo X" i prikaz "X od Y". */
  expenseAmount: number;
  currency: string;
}

export function KrugExpenseSplitPanel({
  krugId, expenseId, isFullMember, isRegularMember = false, allowPropose = true, expenseAmount, currency,
}: Props) {
  const { t } = useTranslation();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: members = [] } = useKrugMembers(krugId);
  const { data, isLoading } = useKrugExpenseOverride(expenseId, isFullMember || isRegularMember);
  const proposeMut = useKrugProposeOverride();
  const confirmMut = useKrugConfirmOverride();
  const rejectMut = useKrugRejectOverride();
  const withdrawMut = useKrugWithdrawOverride();
  const [editing, setEditing] = useState(false);

  const fullMembers = useMemo(
    () => members.filter((m) => m.kind === 'owner' || m.kind === 'punopravni'),
    [members],
  );
  const fullMemberIds = fullMembers.map((m) => m.user_id);
  const ordinaryMemberIds = members.filter((m) => m.kind === 'obicni').map((m) => m.user_id);
  const profiles = useUserProfiles([...fullMemberIds, ...ordinaryMemberIds]);
  const nameFor = (uid: string) =>
    getMemberDisplayName(profiles.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));

  if (!isFullMember && !isRegularMember) return null;
  if (isLoading) {
    return (
      <Card className="p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('common.loading', 'Učitavanje…')}
      </Card>
    );
  }

  const active = data?.active ?? null;
  const pending = data?.pending ?? null;
  const confirmedIds = new Set((pending?.confirmations ?? []).map((c) => c.user_id));
  // Potvrđuju svi punopravni i svaki obični član koji ima udio.
  const requiredIds = Array.from(new Set([...fullMemberIds, ...(pending?.shares ?? []).map((s) => s.user_id)]));
  const awaiting = requiredIds.filter((id) => !confirmedIds.has(id));
  const isProposer = pending?.proposed_by === user?.id;
  const myConfirmed = !!user && confirmedIds.has(user.id);

  // Read-only kontekst bez ičega za prikazati ne uvodi prazan blok u pregled.
  if (!allowPropose && !active && !pending) return null;
  // Obični član vidi samo prijedloge koji ga uključuju (RLS to već reže).
  const includesMe = (row: { shares: OverrideShare[] } | null) => !!row && row.shares.some((s) => s.user_id === user?.id);
  if (!isFullMember && !includesMe(active) && !includesMe(pending)) return null;
  const canPropose = allowPropose && isFullMember;



  const submit = async (shares: OverrideShare[], sharedAmount: number | null) => {
    try {
      await proposeMut.mutateAsync({ expenseId, shares, sharedAmount });
      setEditing(false);
    } catch { /* handled */ }
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="w-4 h-4 text-module-muted" />
          {t('krug.override.title', 'Ručna podjela troška')}
        </div>
        {active && !editing && (
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 text-[10px]">
            {t('krug.override.badge.active', 'Aktivno')}
          </Badge>
        )}
        {pending && !editing && (
          <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px]">
            {t('krug.override.badge.pending', 'Čeka {{n}} potvrda', { n: awaiting.length })}
          </Badge>
        )}
      </div>

      {/* Aktivna podjela */}
      {active && !editing && (
        <div className="text-xs space-y-1">
          <KrugSharedOfLine sharedAmount={active.shared_amount} expenseAmount={expenseAmount} currency={currency} />
          {active.shares.map((s) => (
            <div key={s.user_id} className="flex justify-between">
              <span className="truncate">{nameFor(s.user_id)}</span>
              <span className="tabular-nums font-medium">{s.share_percent.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending prijedlog */}
      {pending && !editing && (
        <div className="space-y-2 border-t pt-2">
          <div className="text-[11px] text-muted-foreground">
            {t('krug.override.pendingProposedBy', 'Predlagatelj')}: {nameFor(pending.proposed_by)}
          </div>
          <KrugSharedOfLine sharedAmount={pending.shared_amount} expenseAmount={expenseAmount} currency={currency} />
          <div className="text-xs space-y-1">
            {pending.shares.map((s) => (
              <div key={s.user_id} className="flex justify-between">
                <span className="truncate flex items-center gap-1">
                  {confirmedIds.has(s.user_id) && <Check className="w-3 h-3 text-emerald-500" />}
                  {nameFor(s.user_id)}
                </span>
                <span className="tabular-nums">{s.share_percent.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {isProposer ? (
              <Button
                size="sm" variant="outline" className="h-8"
                disabled={withdrawMut.isPending}
                onClick={() => withdrawMut.mutate({ overrideId: pending.id, expenseId })}
              >
                <Undo2 className="w-3.5 h-3.5 mr-1" />
                {t('krug.override.actions.withdraw', 'Povuci prijedlog')}
              </Button>
            ) : (
              <>
                {!myConfirmed && (
                  <Button
                    size="sm" className="h-8"
                    disabled={confirmMut.isPending}
                    onClick={() => confirmMut.mutate({ overrideId: pending.id, expenseId })}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    {t('krug.override.actions.confirm', 'Potvrdi')}
                  </Button>
                )}
                <Button
                  size="sm" variant="outline" className="h-8"
                  disabled={rejectMut.isPending}
                  onClick={() => setRejectTarget(pending.id)}
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  {t('krug.override.actions.reject', 'Odbij')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Nema aktivnog ni pending → CTA (samo u edit sloju) */}
      {canPropose && !editing && !pending && (
        <Button size="sm" variant="outline" className="h-8 w-full" onClick={() => setEditing(true)}>
          {active
            ? t('krug.override.actions.propose_new', 'Predloži novu podjelu')
            : t('krug.override.actions.propose', 'Predloži ručnu podjelu')}
        </Button>
      )}

      {/* Editor */}
      {editing && (
        <KrugSplitShareEditor
          fullMemberIds={fullMemberIds}
          ordinaryMemberIds={ordinaryMemberIds}
          nameFor={nameFor}
          expenseAmount={expenseAmount}
          currency={currency}
          submitting={proposeMut.isPending}
          onSubmit={submit}
          onCancel={() => setEditing(false)}
        />
      )}
      <ConfirmActionDialog
        open={!!rejectTarget}
        onOpenChange={(v) => { if (!v) setRejectTarget(null); }}
        title={t('krug.override.rejectDialog.title', 'Odbij podjelu')}
        description={t('krug.override.rejectDialog.description', 'Odbijaš predloženu podjelu troška.')}
        reason={{
          label: t('krug.override.rejectDialog.reasonLabel', 'Razlog (opcionalno)'),
          placeholder: t('krug.override.rejectDialog.reasonPlaceholder', 'npr. iznos nije točan'),
        }}
        confirmLabel={t('krug.override.rejectDialog.confirm', 'Odbij')}
        destructive
        pending={rejectMut.isPending}
        onConfirm={(reason) => {
          if (!rejectTarget) return;
          rejectMut.mutate({ overrideId: rejectTarget, expenseId, reason });
          setRejectTarget(null);
        }}
      />
    </Card>
  );
}
