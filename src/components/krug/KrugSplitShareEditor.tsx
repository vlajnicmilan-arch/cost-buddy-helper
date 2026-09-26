/**
 * Editor novog prijedloga podjele. Punopravni su uvijek u podjeli; obični
 * članovi se nude označeni i ulaze samo kad ih predlagatelj izričito uključi.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { validateOverrideShares, type OverrideShare } from '@/hooks/useKrugExpenseOverride';
import { showError } from '@/hooks/useStatusFeedback';
import { rebalanceShares, formatShare } from '@/lib/krugSplitRebalance';
import { validateSharedAmount } from '@/lib/krugSharedAmount';
import { KrugSharedAmountField } from './KrugSharedAmount';

interface Props {
  fullMemberIds: string[];
  ordinaryMemberIds: string[];
  nameFor: (uid: string) => string;
  expenseAmount: number;
  currency: string;
  submitting: boolean;
  onSubmit: (shares: OverrideShare[], sharedAmount: number | null) => void;
  onCancel: () => void;
}

const evenDraft = (ids: string[], current: Record<string, string>, touched: string[]) => {
  const numeric = Object.fromEntries(ids.map((id) => [id, touched.includes(id) ? Number(current[id] ?? 0) || 0 : 0]));
  const { values } = rebalanceShares(numeric, ids, touched.filter((id) => ids.includes(id)));
  const d: Record<string, string> = {};
  for (const id of ids) d[id] = touched.includes(id) ? (current[id] ?? '0') : formatShare(values[id]);
  return d;
};

export function KrugSplitShareEditor({
  fullMemberIds, ordinaryMemberIds, nameFor, expenseAmount, currency, submitting, onSubmit, onCancel,
}: Props) {
  const { t } = useTranslation();
  const [included, setIncluded] = useState<string[]>([]);
  const [touched, setTouched] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>(() => evenDraft(fullMemberIds, {}, []));
  const [sharedRaw, setSharedRaw] = useState('');
  const [rebalanceError, setRebalanceError] = useState<'touched_over_100' | null>(null);
  const participantIds = [...fullMemberIds, ...ordinaryMemberIds.filter((id) => included.includes(id))];

  const toggleOrdinary = (id: string, on: boolean) => {
    const nextIncluded = on ? [...included, id] : included.filter((x) => x !== id);
    const nextTouched = touched.filter((x) => x !== id);
    const ids = [...fullMemberIds, ...ordinaryMemberIds.filter((x) => nextIncluded.includes(x))];
    setIncluded(nextIncluded);
    setTouched(nextTouched);
    setRebalanceError(null);
    setDraft(evenDraft(ids, draft, nextTouched));
  };

  /** Live raspodjela: dirnuto polje ostaje, ostatak ide po nedirnutima. */
  const handleShareChange = (id: string, raw: string) => {
    const nextTouched = touched.includes(id) ? touched : [...touched, id];
    setTouched(nextTouched);
    const numeric: Record<string, number> = {};
    for (const mid of participantIds) {
      numeric[mid] = mid === id ? Number(raw) || 0 : Number(draft[mid] ?? 0) || 0;
    }
    const { values, error } = rebalanceShares(numeric, participantIds, nextTouched);
    setRebalanceError(error);
    setDraft((d) => {
      const next = { ...d, [id]: raw };
      for (const mid of participantIds) {
        if (mid === id || nextTouched.includes(mid)) continue;
        next[mid] = formatShare(values[mid]);
      }
      return next;
    });
  };

  const submit = () => {
    const shares: OverrideShare[] = participantIds.map((id) => ({ user_id: id, share_percent: Number(draft[id] ?? 0) }));
    const v = validateOverrideShares(shares, fullMemberIds, ordinaryMemberIds);
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
    const shared = validateSharedAmount(sharedRaw, expenseAmount);
    if (shared.ok !== true) {
      showError(shared.error === 'exceeds'
        ? t('krug.override.error.shared_amount_exceeds_amount', 'Dijeljena svota ne smije biti veća od iznosa troška.')
        : t('krug.override.error.shared_amount_invalid', 'Dijeljena svota mora biti veća od 0.'));
      return;
    }
    onSubmit(shares, shared.value);
  };

  const shareInput = (id: string) => (
    <Input
      type="number" step="0.01" min="0" max="100"
      value={draft[id] ?? ''}
      onChange={(e) => handleShareChange(id, e.target.value)}
      className="h-8 w-24 text-right tabular-nums"
      data-testid={`share-input-${id}`}
    />
  );

  return (
    <div className="space-y-2 border-t pt-2">
      <KrugSharedAmountField value={sharedRaw} onChange={setSharedRaw} expenseAmount={expenseAmount} currency={currency} />
      {fullMemberIds.map((id) => (
        <div key={id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">{nameFor(id)}</span>
          {shareInput(id)}
          <span className="text-muted-foreground">%</span>
        </div>
      ))}
      {ordinaryMemberIds.length > 0 && (
        <div className="space-y-2 border-t pt-2" data-testid="ordinary-members">
          <p className="text-[11px] text-muted-foreground">{t('krug.override.ordinary.hint')}</p>
          {ordinaryMemberIds.map((id) => {
            const on = included.includes(id);
            return (
              <div key={id} className="flex items-center gap-2 text-xs min-h-[44px]" data-testid={`ordinary-row-${id}`}>
                <Checkbox
                  id={`inc-${id}`}
                  checked={on}
                  onCheckedChange={(v) => toggleOrdinary(id, v === true)}
                  aria-label={`${t('krug.override.ordinary.include')} ${nameFor(id)}`}
                />
                <label htmlFor={`inc-${id}`} className="flex-1 truncate flex items-center gap-1.5">
                  {nameFor(id)}
                  <Badge variant="outline" className="text-[10px]">{t('krug.override.ordinary.badge')}</Badge>
                </label>
                {on ? (
                  <>
                    {shareInput(id)}
                    <span className="text-muted-foreground">%</span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{t('krug.override.ordinary.notIncluded')}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {rebalanceError === 'touched_over_100' && (
        <div className="text-[11px] text-destructive text-right">
          {t('krug.override.error.touched_over_100', 'Ručno uneseni postoci već premašuju 100%.')}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground text-right">
        {t('krug.override.sumLabel', 'Zbroj')}: {participantIds.reduce((a, id) => a + Number(draft[id] ?? 0), 0).toFixed(2)}%
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          {t('common.cancel', 'Odustani')}
        </Button>
        <Button size="sm" className="h-8 flex-1" onClick={submit} disabled={submitting} data-testid="override-submit">
          {submitting && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          {t('krug.override.actions.submit', 'Pošalji prijedlog')}
        </Button>
      </div>
    </div>
  );
}
