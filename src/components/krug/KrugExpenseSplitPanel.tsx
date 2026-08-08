/**
 * Inline panel za override podjele u ExpenseEdit sloju.
 * Progresivno otkrivanje: sažeti pregled → forma za novi prijedlog.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  validateOverrideShares,
  type OverrideShare,
} from '@/hooks/useKrugExpenseOverride';
import { showError } from '@/hooks/useStatusFeedback';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { rebalanceShares, formatShare } from '@/lib/krugSplitRebalance';


interface Props {
  krugId: string;
  expenseId: string;
  isFullMember: boolean;
  /** Read-only kontekst (pregled transakcije) ne nudi kreiranje prijedloga. */
  allowPropose?: boolean;
}

export function KrugExpenseSplitPanel({ krugId, expenseId, isFullMember, allowPropose = true }: Props) {
  const { t } = useTranslation();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: members = [] } = useKrugMembers(krugId);
  const { data, isLoading } = useKrugExpenseOverride(expenseId, isFullMember);
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
  const profiles = useUserProfiles(fullMemberIds);
  const nameFor = (uid: string) =>
    getMemberDisplayName(profiles.get(uid), uid, t('krug.member.unknown', 'Nepoznat član'));

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<string[]>([]);
  const [rebalanceError, setRebalanceError] = useState<'touched_over_100' | null>(null);
  const initDraft = () => {
    const values = rebalanceShares(
      Object.fromEntries(fullMemberIds.map((id) => [id, 0])),
      fullMemberIds,
      [],
    ).values;
    const d: Record<string, string> = {};
    for (const id of fullMemberIds) d[id] = formatShare(values[id]);
    setDraft(d);
    setTouched([]);
    setRebalanceError(null);
    setEditing(true);
  };

  /** Live raspodjela: dirnuto polje ostaje, ostatak ide po nedirnutima. */
  const handleShareChange = (id: string, raw: string) => {
    const nextTouched = touched.includes(id) ? touched : [...touched, id];
    setTouched(nextTouched);
    const numeric: Record<string, number> = {};
    for (const mid of fullMemberIds) {
      numeric[mid] = mid === id ? Number(raw) || 0 : Number(draft[mid] ?? 0) || 0;
    }
    const { values, error } = rebalanceShares(numeric, fullMemberIds, nextTouched);
    setRebalanceError(error);
    setDraft((d) => {
      const next = { ...d, [id]: raw };
      for (const mid of fullMemberIds) {
        if (mid === id || nextTouched.includes(mid)) continue;
        next[mid] = formatShare(values[mid]);
      }
      return next;
    });
  };


  if (!isFullMember) return null;
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
  const awaiting = fullMemberIds.filter((id) => !confirmedIds.has(id));
  const isProposer = pending?.proposed_by === user?.id;
  const myConfirmed = !!user && confirmedIds.has(user.id);

  // Read-only kontekst bez ičega za prikazati ne uvodi prazan blok u pregled.
  if (!allowPropose && !active && !pending) return null;



  const submit = async () => {
    const shares: OverrideShare[] = fullMemberIds.map((id) => ({
      user_id: id,
      share_percent: Number(draft[id] ?? 0),
    }));
    const v = validateOverrideShares(shares, fullMemberIds);
    if (v.ok !== true) {
      const map = {
        missing_members: t('krug.override.error.shares_all_members', 'Podjela mora obuhvatiti sve punopravne članove.'),
        extra_members: t('krug.override.error.shares_users_mismatch', 'Skup članova ne odgovara.'),
        sum_not_100: t('krug.override.error.shares_sum', 'Zbroj postotaka mora biti 100%.'),
        negative: t('krug.override.error.negative', 'Postotak ne smije biti negativan.'),
      };
      showError(map[v.error]);
      return;
    }
    try {
      await proposeMut.mutateAsync({ expenseId, shares });
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
      {allowPropose && !editing && !pending && (
        <Button size="sm" variant="outline" className="h-8 w-full" onClick={initDraft}>
          {active
            ? t('krug.override.actions.propose_new', 'Predloži novu podjelu')
            : t('krug.override.actions.propose', 'Predloži ručnu podjelu')}
        </Button>
      )}

      {/* Editor */}
      {editing && (
        <div className="space-y-2 border-t pt-2">
          {fullMemberIds.map((id) => (
            <div key={id} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate">{nameFor(id)}</span>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={draft[id] ?? ''}
                onChange={(e) => handleShareChange(id, e.target.value)}
                className="h-8 w-24 text-right tabular-nums"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          ))}
          {rebalanceError === 'touched_over_100' && (
            <div className="text-[11px] text-destructive text-right">
              {t('krug.override.error.touched_over_100', 'Ručno uneseni postoci već premašuju 100%.')}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground text-right">
            {t('krug.override.sumLabel', 'Zbroj')}: {fullMemberIds.reduce((a, id) => a + Number(draft[id] ?? 0), 0).toFixed(2)}%
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button size="sm" className="h-8 flex-1" onClick={submit} disabled={proposeMut.isPending}>
              {proposeMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              {t('krug.override.actions.submit', 'Pošalji prijedlog')}
            </Button>
          </div>
        </div>
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
