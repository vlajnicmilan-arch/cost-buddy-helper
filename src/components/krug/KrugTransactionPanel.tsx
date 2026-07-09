/**
 * KrugTransactionPanel — UI sloj za transakcijsku Krug semantiku.
 *
 * Renderira se unutar TransactionDetailDialog samo kad transakcija
 * ima `krug_id`. NE odlučuje o pristupu — sve odluke su zrcalo SQL-a
 * preko pure helpera u `@/lib/krugDecisions`. RPC ostaje izvor istine.
 *
 * Semantics Lock v1 (WS1a):
 *   - Privacy switcher nudi isključivo `personal` i `shared`.
 *   - `private` više NIJE user-facing izbor. Legacy zapis s
 *     `krug_privacy='private'` prikazuje se kao `personal` uz hint;
 *     zapis se ne mijenja dok korisnik ne odabere novi izbor.
 *   - T8: A1 / A2 / A4 / A5; 1.5: A3 (autor retract), A7 (full member → personal).
 *
 * Wizard kreiranja Kruga i prikaz po kontekstu nisu dio ovog panela.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useKrug } from '@/hooks/useKrug';
import { useKrugSetPrivacy } from '@/hooks/useKrugSetPrivacy';
import { useKrugApplyAct, useKrugWithdraw } from '@/hooks/useKrugAct';
import { useKrugRetract } from '@/hooks/useKrugRetract';
import { useKrugGovernToPersonal } from '@/hooks/useKrugGovernToPersonal';
import {
  decideSetPrivacy,
  decideApplyAct,
  decideWithdraw,
  decideRetract,
  decideGovernToPersonal,
  type KrugPrivacy,
  type KrugSharedStatus,
} from '@/lib/krugDecisions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, User, Check, X, RotateCcw, Undo2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  expenseId: string;
  expenseAuthorId: string;
}

interface KrugExpenseRow {
  krug_id: string | null;
  krug_privacy: KrugPrivacy | null;
  krug_shared_status: KrugSharedStatus | null;
  deleted_at: string | null;
}

const PLACEHOLDER_REQUEST_ID = '00000000-0000-0000-0000-000000000000';

export function KrugTransactionPanel({ expenseId, expenseAuthorId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const expQuery = useQuery({
    queryKey: ['expenses', 'krug-fields', expenseId],
    enabled: !!expenseId,
    queryFn: async (): Promise<KrugExpenseRow | null> => {
      const { data, error } = await supabase
        .from('expenses')
        .select('krug_id, krug_privacy, krug_shared_status, deleted_at')
        .eq('id', expenseId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as KrugExpenseRow | null;
    },
  });

  const krugId = expQuery.data?.krug_id ?? null;
  const krugQuery = useKrug(krugId);

  const setPrivacy = useKrugSetPrivacy();
  const applyAct = useKrugApplyAct();
  const withdraw = useKrugWithdraw();
  const retract = useKrugRetract();
  const govern = useKrugGovernToPersonal();

  const pending =
    setPrivacy.isPending ||
    applyAct.isPending ||
    withdraw.isPending ||
    retract.isPending ||
    govern.isPending;

  const flags = useMemo(() => {
    const row = expQuery.data;
    const k = krugQuery.data;
    const me = user?.id ?? null;
    const isAuthor = !!me && me === expenseAuthorId;
    const ownerId = k?.ownership?.user_id ?? null;
    const isOwner = !!me && me === ownerId;
    const role = k?.myMembership?.role ?? null;
    // Owner se UVIJEK tretira kao punopravni član (Krug Foundation v4.2).
    const isFullMember = isOwner || role === 'punopravni';
    const prevPrivacy = (row?.krug_privacy ?? null) as KrugPrivacy | null;
    const prevStatus = (row?.krug_shared_status ?? null) as KrugSharedStatus | null;
    const inSharedFlow = !!row?.krug_id && prevPrivacy === 'shared';
    const alreadyDeleted = !!row?.deleted_at;
    return {
      isAuthor,
      isFullMember,
      prevPrivacy,
      prevStatus,
      inSharedFlow,
      alreadyDeleted,
      authenticated: !!me,
      expenseFound: !!row,
    };
  }, [expQuery.data, krugQuery.data, user?.id, expenseAuthorId]);

  if (!expQuery.data?.krug_id) return null;
  if (expQuery.isLoading || krugQuery.isLoading) {
    return (
      <div className="rounded-lg border bg-card/50 p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('krug.transaction.loading', 'Učitavam…')}
      </div>
    );
  }

  const krug = krugQuery.data?.krug;
  if (!krug) return null;

  // ---- Decisions ----
  const canSet = (target: KrugPrivacy) =>
    decideSetPrivacy({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      hasKrugContext: true,
      isAuthor: flags.isAuthor,
      isFullMember: flags.isFullMember,
      prevPrivacy: flags.prevPrivacy,
      prevStatus: flags.prevStatus,
      newPrivacy: target,
    }).startsWith('ok_') ||
    decideSetPrivacy({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      hasKrugContext: true,
      isAuthor: flags.isAuthor,
      isFullMember: flags.isFullMember,
      prevPrivacy: flags.prevPrivacy,
      prevStatus: flags.prevStatus,
      newPrivacy: target,
    }) === 'noop_already_in_target_state';

  const a1 =
    decideApplyAct({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      inSharedFlow: flags.inSharedFlow,
      isAuthor: flags.isAuthor,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      act: 'A1',
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_confirmed';
  const a2 =
    decideApplyAct({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      inSharedFlow: flags.inSharedFlow,
      isAuthor: flags.isAuthor,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      act: 'A2',
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_negated';
  const a5 =
    decideApplyAct({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      inSharedFlow: flags.inSharedFlow,
      isAuthor: flags.isAuthor,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      act: 'A5',
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_reproposed';
  const a4 =
    decideWithdraw({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      alreadyDeleted: flags.alreadyDeleted,
      isAuthor: flags.isAuthor,
      inSharedFlow: flags.inSharedFlow,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_withdrawn';
  const a3 =
    decideRetract({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      alreadyDeleted: flags.alreadyDeleted,
      isAuthor: flags.isAuthor,
      inSharedFlow: flags.inSharedFlow,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_retracted';
  const a7 =
    decideGovernToPersonal({
      authenticated: flags.authenticated,
      expenseFound: flags.expenseFound,
      alreadyDeleted: flags.alreadyDeleted,
      inSharedFlow: flags.inSharedFlow,
      isFullMember: flags.isFullMember,
      prevStatus: flags.prevStatus,
      clientRequestId: PLACEHOLDER_REQUEST_ID,
    }) === 'ok_governed_to_personal';

  // ---- UI ----
  const privacyOptions: { key: KrugPrivacy; label: string; hint: string; icon: JSX.Element }[] = [
    { key: 'personal', label: t('krug.privacy.personal', 'Moje'), hint: t('krug.privacyHint.personal', 'Ne ide na potvrdu Krugu.'), icon: <User className="w-3.5 h-3.5" /> },
    { key: 'private', label: t('krug.privacy.private', 'Skriveno od Kruga'), hint: t('krug.privacyHint.private', 'Ostali članovi ovo ne vide.'), icon: <EyeOff className="w-3.5 h-3.5" /> },
    { key: 'shared', label: t('krug.privacy.shared', 'Za Krug'), hint: t('krug.privacyHint.shared', 'Šalje se ostalima na potvrdu.'), icon: <Users className="w-3.5 h-3.5" /> },
  ];

  const statusLabel: Record<KrugSharedStatus, string> = {
    predlozena: t('krug.status.predlozena', 'Predloženo'),
    potvrdjena: t('krug.status.potvrdjena', 'Potvrđeno'),
    nepotvrdjena: t('krug.status.nepotvrdjena', 'Nepotvrđeno'),
  };

  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="w-4 h-4 text-primary" />
          <span>{t('krug.transaction.title', 'Krug')}</span>
          <span className="text-muted-foreground font-normal truncate max-w-[140px]">
            {krug.name}
          </span>
        </div>
        {flags.prevPrivacy === 'shared' && flags.prevStatus && (
          <Badge
            variant="secondary"
            className={cn(
              'text-xs',
              flags.prevStatus === 'potvrdjena' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
              flags.prevStatus === 'nepotvrdjena' && 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
              flags.prevStatus === 'predlozena' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            )}
          >
            {statusLabel[flags.prevStatus]}
          </Badge>
        )}
      </div>

      {/* Privacy switcher — samo autor; iz shared se izlazi kroz A7 (full member) */}
      {flags.isAuthor && flags.prevPrivacy !== 'shared' && (
        <div className="flex gap-1.5 flex-wrap">
          {privacyOptions.map((opt) => {
            const enabled = canSet(opt.key) && !pending;
            const active = flags.prevPrivacy === opt.key;
            return (
              <Button
                key={opt.key}
                size="sm"
                variant={active ? 'default' : 'outline'}
                disabled={!enabled || active}
                onClick={() => setPrivacy.mutate({ expenseId, newPrivacy: opt.key })}
                className="flex-col items-start text-left h-auto py-1.5 px-2.5 gap-0.5"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  {opt.icon}
                  {opt.label}
                </span>
                <span className={cn('text-[10px] leading-tight', active ? 'opacity-90' : 'text-muted-foreground')}>
                  {opt.hint}
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {/* A-akti */}
      {(a1 || a2 || a4 || a5 || a3 || a7) && (
        <div className="flex gap-1.5 flex-wrap pt-1 border-t border-border/40">
          {a1 && (
            <Button
              size="sm"
              variant="default"
              disabled={pending}
              onClick={() => applyAct.mutate({ expenseId, act: 'A1' })}
              className="h-8 px-2.5 text-xs gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('krug.act.A1', 'Potvrdi')}
            </Button>
          )}
          {a2 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => applyAct.mutate({ expenseId, act: 'A2' })}
              className="h-8 px-2.5 text-xs gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              {t('krug.act.A2', 'Negiraj')}
            </Button>
          )}
          {a5 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => applyAct.mutate({ expenseId, act: 'A5' })}
              className="h-8 px-2.5 text-xs gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('krug.act.A5', 'Predloži ponovo')}
            </Button>
          )}
          {a4 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => withdraw.mutate({ expenseId })}
              className="h-8 px-2.5 text-xs gap-1.5 text-destructive border-destructive/40"
            >
              <Undo2 className="w-3.5 h-3.5" />
              {t('krug.act.A4', 'Povuci prijedlog')}
            </Button>
          )}
          {a3 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => retract.mutate({ expenseId })}
              className="h-8 px-2.5 text-xs gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {t('krug.act.A3', 'Vrati na osobno')}
            </Button>
          )}
          {a7 && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => govern.mutate({ expenseId })}
              className="h-8 px-2.5 text-xs gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {t('krug.act.A7', 'Prebaci na osobno')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
