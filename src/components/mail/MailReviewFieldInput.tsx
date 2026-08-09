import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getDateRange, makeCalendarDisabled, type DateContext } from '@/lib/dateValidation';
import { dateToIso, formatDateHr, isoToDate, parseHrDate } from '@/lib/dateFormat';
import { parseHrAmount } from '@/lib/money';

/**
 * MAIL UVOZ — polje za uređivanje u pregledu.
 *
 * Datum: shadcn Calendar (obrazac aplikacije) UZ tolerantan tekstualni unos —
 * u pregledu se datum često prepisuje s računa. Iznos: hrvatski oblik.
 * Nevaljan unos NIKAD ne pada tiho — inline poruka s primjerom.
 */

export type MailFieldKind = 'text' | 'date' | 'amount';

interface Props {
  label: string;
  kind: MailFieldKind;
  value: string;
  dateContext?: DateContext;
  onChange: (next: string) => void;
}

export const isMailFieldInvalid = (kind: MailFieldKind, value: string): boolean => {
  if (!value.trim()) return false;
  if (kind === 'date') return parseHrDate(value) === null;
  if (kind === 'amount') return parseHrAmount(value) === null;
  return false;
};

export const MailReviewFieldInput = ({ label, kind, value, dateContext, onChange }: Props) => {
  const { t } = useTranslation();
  const invalid = isMailFieldInvalid(kind, value);
  const range = getDateRange(dateContext ?? 'expense');

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11"
          inputMode={kind === 'amount' ? 'decimal' : undefined}
          aria-invalid={invalid}
        />
        {kind === 'date' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                aria-label={t('mailReview.pickDate', 'Odaberi datum')}
              >
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={isoToDate(value)}
                disabled={makeCalendarDisabled(range)}
                onSelect={(d) => d && onChange(formatDateHr(dateToIso(d)))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {kind === 'date'
            ? t('mailReview.invalidDate', 'Nevaljan datum — npr. 15.08.2026.')
            : t('mailReview.invalidAmount', 'Nevaljan iznos — npr. 1.660,36')}
        </p>
      )}
    </div>
  );
};
