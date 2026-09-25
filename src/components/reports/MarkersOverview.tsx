import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';
import { buildLoanSummary, monthRange, sumTaggedSpend, type MarkerRow } from '@/lib/expenseMarkers';

/** „Nepotrebno/Luksuz ovaj mjesec" + pregled pozajmica po osobi. Samo čitanje. */
export const MarkersOverview = ({ expenses }: { expenses: readonly MarkerRow[] }) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const range = useMemo(() => monthRange(new Date()), []);
  const unnecessary = useMemo(() => sumTaggedSpend(expenses, 'unnecessary', range), [expenses, range]);
  const luxury = useMemo(() => sumTaggedSpend(expenses, 'luxury', range), [expenses, range]);
  const loans = useMemo(() => buildLoanSummary(expenses), [expenses]);

  return (
    <div className="space-y-4" data-testid="markers-overview">
      <div className="grid grid-cols-2 gap-3">
        {([['unnecessary', unnecessary], ['luxury', luxury]] as const).map(([tag, v]) => (
          <Card key={tag}>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{t(`expenseMarkers.card.${tag}`)}</p>
              <p className="font-mono font-bold text-lg">{formatAmount(v.total)}</p>
              <p className="text-[11px] text-muted-foreground">{t('expenseMarkers.card.count', { count: v.count })}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loans.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('expenseMarkers.loans.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loans.map((p) => (
              <div key={p.key} className="border-b border-border last:border-0 pb-2 last:pb-0 text-sm">
                <p className="font-medium">{p.name || t('expenseMarkers.loans.noName')}</p>
                {(p.given > 0 || p.repaidToMe > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {t('expenseMarkers.loans.lent', {
                      given: formatAmount(p.given), repaid: formatAmount(p.repaidToMe), left: formatAmount(p.owedToMe),
                    })}
                  </p>
                )}
                {(p.received > 0 || p.repaidByMe > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {t('expenseMarkers.loans.borrowed', {
                      received: formatAmount(p.received), repaid: formatAmount(p.repaidByMe), left: formatAmount(p.iOwe),
                    })}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
