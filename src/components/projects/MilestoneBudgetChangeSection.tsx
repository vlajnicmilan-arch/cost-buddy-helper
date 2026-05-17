import { useEffect, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Shield, ArrowRightLeft, Plus, Lightbulb, FileSignature } from 'lucide-react';
import {
  MilestoneRevisionType,
  MilestoneRevisionCoverage,
  REVISION_TYPE_META,
} from '@/types/milestoneRevision';
import { ProjectMilestone } from '@/types/project';

interface Props {
  previousAmount: number;
  newAmount: number;
  reason: string;
  onReasonChange: (v: string) => void;
  changeType: MilestoneRevisionType | null;
  onChangeTypeChange: (t: MilestoneRevisionType | null) => void;
  coverage: MilestoneRevisionCoverage;
  onCoverageChange: (c: MilestoneRevisionCoverage) => void;
  linkedMilestoneId: string | null;
  onLinkedMilestoneChange: (id: string | null) => void;
  siblingMilestones: ProjectMilestone[];
  contingencyMilestone: ProjectMilestone | null;
  currentMilestoneId: string | null;
  /** Current spent / previousAmount * 100. Drives the auto-suggestion to pull from reserve. */
  currentUsagePct?: number;
}

const TYPE_OPTIONS: MilestoneRevisionType[] = ['overrun', 'saving', 'scope_change', 'correction'];

export const MilestoneBudgetChangeSection = ({
  previousAmount,
  newAmount,
  reason,
  onReasonChange,
  changeType,
  onChangeTypeChange,
  coverage,
  onCoverageChange,
  linkedMilestoneId,
  onLinkedMilestoneChange,
  siblingMilestones,
  contingencyMilestone,
  currentMilestoneId,
  currentUsagePct,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const delta = newAmount - previousAmount;
  const isIncrease = delta > 0;

  // Source candidates for "transfer" — sibling phases (excluding current and contingency) with budget
  const transferCandidates = useMemo(
    () =>
      siblingMilestones.filter(
        (m) =>
          m.id !== currentMilestoneId &&
          !m.is_contingency &&
          m.budget > 0
      ),
    [siblingMilestones, currentMilestoneId]
  );

  const contingencyAvailable = !!(contingencyMilestone && contingencyMilestone.budget > 0);
  const isOverBudget = typeof currentUsagePct === 'number' && currentUsagePct >= 100;
  const shouldSuggestReserve = isIncrease && isOverBudget && contingencyAvailable;

  // Auto-preselect "pull from reserve" the first time this section opens
  // for an over-budget phase that has reserve available — only if user hasn't picked anything yet.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (shouldSuggestReserve && coverage === 'increase_total') {
      onCoverageChange('contingency');
      autoSelectedRef.current = true;
    }
  }, [shouldSuggestReserve, coverage, onCoverageChange]);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {t('projects.revisions.title', 'Promjena budžeta faze')}
        </span>
        <Badge variant="outline" className={cn('gap-1', isIncrease ? 'text-destructive border-destructive/40' : 'text-income border-income/40')}>
          {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isIncrease ? '+' : ''}{formatAmount(delta)}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        {formatAmount(previousAmount)} → <span className="font-semibold text-foreground">{formatAmount(newAmount)}</span>
      </div>

      {/* Auto-suggestion banner: phase already over budget AND reserve has funds */}
      {shouldSuggestReserve && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-foreground">
          <Lightbulb className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">
              {t('projects.revisions.suggestReserve', 'Predlažemo povlačenje iz Rezerve')}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {t('projects.revisions.suggestReserveHelp', 'Faza je iznad 100% budžeta. Preostalo u rezervi: {{amt}}.', {
                amt: formatAmount(contingencyMilestone!.budget),
              })}
            </div>
          </div>
        </div>
      )}

      {/* Reason — required */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          {t('projects.revisions.reason', 'Razlog promjene')} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={2}
          placeholder={t('projects.revisions.reasonPlaceholder', 'npr. Cijena materijala porasla 15%, dodatni rad...')}
          className="text-sm"
        />
      </div>

      {/* Change type — optional chips */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {t('projects.revisions.changeType', 'Tip promjene (neobavezno)')}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((type) => {
            const meta = REVISION_TYPE_META[type];
            const active = changeType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChangeTypeChange(active ? null : type)}
                className={cn(
                  'px-2.5 py-1 rounded-full border text-xs transition-all',
                  active
                    ? meta.colorClass + ' font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <span className="mr-1">{meta.emoji}</span>
                {t(`projects.revisions.types.${type}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Coverage — only relevant for increases */}
      {isIncrease && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('projects.revisions.coverage', 'Kako pokriti dodatni iznos?')}
          </Label>
          <RadioGroup value={coverage} onValueChange={(v) => onCoverageChange(v as MilestoneRevisionCoverage)} className="space-y-1.5">
            <label className="flex items-start gap-2 p-2 rounded-md border bg-card cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="increase_total" id="cov-increase" className="mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-medium flex items-center gap-1.5">
                  <Plus className="w-3 h-3" />
                  {t('projects.revisions.coverageIncrease', 'Povećaj ukupni budžet projekta')}
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {t('projects.revisions.coverageIncreaseHelp', 'Standardno za nepredviđene troškove')}
                </div>
              </div>
            </label>

            {contingencyAvailable && (
              <label className="flex items-start gap-2 p-2 rounded-md border bg-card cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="contingency" id="cov-cont" className="mt-0.5" />
                <div className="flex-1 text-xs">
                  <div className="font-medium flex items-center gap-1.5">
                    <Shield className="w-3 h-3" />
                    {t('projects.revisions.coverageContingency', 'Povuci iz rezerve')}
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {formatAmount(contingencyMilestone!.budget)}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {t('projects.revisions.coverageContingencyHelp', 'Smanjuje fazu „Rezerva za nepredviđeno“')}
                  </div>
                </div>
              </label>
            )}

            {transferCandidates.length > 0 && (
              <label className="flex items-start gap-2 p-2 rounded-md border bg-card cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="transfer" id="cov-transfer" className="mt-0.5" />
                <div className="flex-1 text-xs space-y-1.5">
                  <div className="font-medium flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3 h-3" />
                    {t('projects.revisions.coverageTransfer', 'Prenesi s druge faze')}
                  </div>
                  {coverage === 'transfer' && (
                    <Select value={linkedMilestoneId || ''} onValueChange={(v) => onLinkedMilestoneChange(v || null)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t('projects.revisions.selectSource', 'Odaberi izvornu fazu')} />
                      </SelectTrigger>
                      <SelectContent>
                        {transferCandidates.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} ({formatAmount(m.budget)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </label>
            )}
          </RadioGroup>
        </div>
      )}
    </div>
  );
};
