/**
 * Krug "Dijeli samo X" — polje u editoru prijedloga i redak "dijeli se X od Y".
 */
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  effectiveSharedAmount,
  formatSharedMoney as formatMoney,
  isPartialShare,
  validateSharedAmount,
} from '@/lib/krugSharedAmount';

const langOf = (l: string | undefined): string | undefined => l;

interface FieldProps {
  value: string;
  onChange: (v: string) => void;
  expenseAmount: number;
  currency: string;
}

export function KrugSharedAmountField({ value, onChange, expenseAmount, currency }: FieldProps) {
  const { t, i18n } = useTranslation();
  const check = validateSharedAmount(value, expenseAmount);
  const total = formatMoney(Math.abs(expenseAmount), currency, langOf(i18n.language));
  return (
    <div className="space-y-1">
      <label htmlFor="krug-shared-amount" className="text-xs font-medium">
        {t('krug.override.sharedAmount.label', 'Dijeli samo (neobavezno)')}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="krug-shared-amount"
          data-testid="krug-shared-amount"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={total}
          aria-invalid={!check.ok}
          className="h-11 flex-1 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{currency}</span>
      </div>
      <p className={check.ok ? 'text-[11px] text-muted-foreground' : 'text-[11px] text-destructive'}>
        {check.ok
          ? t('krug.override.sharedAmount.hint', 'Prazno = dijeli se cijeli iznos ({{total}}). Ostatak ostaje tvoj trošak.', { total })
          : check.error === 'exceeds'
            ? t('krug.override.error.shared_amount_exceeds_amount', 'Dijeljena svota ne smije biti veća od iznosa troška.')
            : t('krug.override.error.shared_amount_invalid', 'Dijeljena svota mora biti veća od 0.')}
      </p>
    </div>
  );
}

interface LineProps {
  sharedAmount: number | null | undefined;
  expenseAmount: number;
  currency: string;
}

/** "Dijeli se X od Y" — prikazuje se samo kad se dijeli manje od cijelog iznosa. */
export function KrugSharedOfLine({ sharedAmount, expenseAmount, currency }: LineProps) {
  const { t, i18n } = useTranslation();
  if (!isPartialShare(sharedAmount, expenseAmount)) return null;
  const lang = langOf(i18n.language);
  return (
    <div data-testid="krug-shared-of" className="text-[11px] text-muted-foreground">
      {t('krug.override.sharedAmount.sharedOf', 'Dijeli se {{shared}} od {{total}}', {
        shared: formatMoney(effectiveSharedAmount(sharedAmount, expenseAmount), currency, lang),
        total: formatMoney(Math.abs(expenseAmount), currency, lang),
      })}
    </div>
  );
}
