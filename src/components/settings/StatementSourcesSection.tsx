import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Landmark, Loader2, Trash2 } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useStatementSourceMemory, type StatementSourceRule } from '@/hooks/useStatementSourceMemory';
import { formatDateHr } from '@/lib/dateFormat';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';

/**
 * Settings → „Uvoz iz e-maila" → RAČUNI S IZVODA.
 *
 * Isti obrazac kao „Moji izdavatelji": svako pravilo je nastalo vidljivom
 * korisnikovom kvačicom pri uvozu izvoda, a zaborav je jedan dodir.
 */
export const StatementSourcesSection = () => {
  const { t } = useTranslation();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const { rules, loading, working, forgetRule } = useStatementSourceMemory(hasAccess);
  const { customPaymentSources } = useCustomPaymentSources({ includePersonal: true });
  const [pending, setPending] = useState<StatementSourceRule | null>(null);

  if (accessLoading || !hasAccess) return null;

  const sourceName = (id: string | null) =>
    customPaymentSources.find((s) => s.id === id)?.name ??
    t('statements.sourceMissing', '(novčanik obrisan)');

  const handleForget = async () => {
    if (!pending) return;
    const ok = await forgetRule(pending.id);
    setPending(null);
    if (ok) showSuccess(t('statements.ruleForgotten', 'Pravilo je obrisano'));
    else showError(t('statements.ruleForgetFailed', 'Brisanje nije uspjelo'));
  };

  return (
    <CollapsibleSection
      title={t('statements.rulesTitle', 'Računi s izvoda')}
      count={rules.length}
      testId="statement-sources-section"
    >
      <div className="space-y-4 pt-1">
      <p className="text-xs text-muted-foreground">
        {t(
          'statements.rulesDescription',
          'Zapamćeno je u koji novčanik ide izvod za pojedini IBAN. Sljedeći izvod stiže s već odabranim novčanikom.',
        )}
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading', 'Učitavanje...')}
        </div>
      )}

      {!loading && rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('statements.rulesEmpty', 'Još nema zapamćenih računa s izvoda.')}
        </p>
      )}

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} data-testid="statement-rule-row" className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium truncate">
                  <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {r.bank_name || t('statements.unknownBank', '(nepoznata banka)')}
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all">{r.account_identifier}</p>
                <p className="text-xs text-muted-foreground">
                  {t('statements.ruleTarget', 'Novčanik: {{name}}', {
                    name: sourceName(r.payment_source_id),
                  })}
                  {r.last_used_at ? ` · ${formatDateHr(r.last_used_at)}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] shrink-0"
                disabled={working}
                aria-label={t('statements.forgetRule', 'Zaboravi pravilo')}
                onClick={() => setPending(r)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('statements.forgetRule', 'Zaboravi pravilo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'statements.forgetRuleConfirm',
                'Sljedeći izvod za ovaj IBAN više neće imati unaprijed odabran novčanik.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleForget}>
              {t('common.confirm', 'Potvrdi')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </CollapsibleSection>
  );
};
