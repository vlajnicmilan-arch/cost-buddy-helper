import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useFamilyMemberConsent,
  type FamilyRelationship,
} from '@/hooks/useFamilyMemberConsent';
import { RELATIONSHIP_OPTIONS } from '@/lib/familyRelationships';

interface Props {
  groupId: string;
  /** Hide the "share income" UI if group is not in proportional mode. */
  showIncomeFields: boolean;
}


/**
 * Inline card shown to the current user inside the Team tab.
 * Lets them set income-share consent, declared monthly income, and a
 * monthly contribution baseline.
 */
export const FamilyMemberConsentCard = ({ groupId, showIncomeFields }: Props) => {
  const { t } = useTranslation();
  const { data, loading, saving, save } = useFamilyMemberConsent(groupId);

  const [income, setIncome] = useState<string>('');
  const [contribution, setContribution] = useState<string>('');

  useEffect(() => {
    if (data) {
      setIncome(data.declared_monthly_income != null ? String(data.declared_monthly_income) : '');
      setContribution(data.monthly_contribution ? String(data.monthly_contribution) : '');
    }
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const parseNum = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.'));
    if (!isFinite(n) || n < 0) return null;
    return n;
  };

  const onSaveIncome = () => {
    save({ declared_monthly_income: parseNum(income) });
  };

  const onSaveContribution = () => {
    const n = parseNum(contribution);
    save({ monthly_contribution: n ?? 0 });
  };

  return (
    <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        <Label className="text-xs flex-1">
          {t('family.relationship.label', 'Moja uloga u obitelji')}
        </Label>
        <Select
          value={data.relationship ?? 'none'}
          disabled={saving}
          onValueChange={(v) =>
            save({ relationship: v === 'none' ? null : (v as FamilyRelationship) })
          }
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue
              placeholder={t('family.relationship.placeholder', 'Odaberi…')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t('family.relationship.none', 'Nije navedeno')}
            </SelectItem>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`family.relationship.options.${r}`, r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>


      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {data.income_share_consent ? (
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          ) : (
            <ShieldOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <Label className="text-sm font-medium">
              {t('family.split.consent.title', 'Dijeli moj prihod')}
            </Label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t(
                'family.split.consent.hint',
                'Bez suglasnosti tvoj prihod neće biti korišten u izračunu proporcionalne podjele.'
              )}
            </p>
          </div>
        </div>
        <Switch
          checked={data.income_share_consent}
          disabled={saving}
          onCheckedChange={(checked) => save({ income_share_consent: checked })}
        />
      </div>

      {showIncomeFields && data.income_share_consent && (
        <div className="space-y-2 pl-6">
          <Label className="text-xs">{t('family.split.consent.declaredIncome', 'Deklarirani mjesečni prihod')}</Label>
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="0.00"
              className="h-9 text-sm"
              disabled={saving}
            />
            <span className="text-xs text-muted-foreground">{data.declared_income_currency}</span>
            <Button size="sm" variant="outline" onClick={onSaveIncome} disabled={saving}>
              {t('family.split.consent.save', 'Spremi')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2 pl-6">
        <Label className="text-xs">{t('family.split.consent.monthlyContribution', 'Mjesečna doplata u kasu')}</Label>
        <p className="text-[10px] text-muted-foreground -mt-1">
          {t(
            'family.split.consent.monthlyContributionHint',
            'Fiksni iznos koji uvijek dodaješ na svoj udio (npr. student-doprinos).'
          )}
        </p>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
            placeholder="0.00"
            className="h-9 text-sm"
            disabled={saving}
          />
          <Button size="sm" variant="outline" onClick={onSaveContribution} disabled={saving}>
            {t('family.split.consent.save', 'Spremi')}
          </Button>
        </div>
      </div>
    </div>
  );
};
