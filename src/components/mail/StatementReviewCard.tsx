import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Landmark, Download, Loader2, X } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { formatDateHr } from '@/lib/dateFormat';
import { formatHrAmount } from '@/lib/money';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  useStatementSourceMemory,
  suggestSourceFromBankAccounts,
  normalizeIban,
} from '@/hooks/useStatementSourceMemory';
import { useStatementImport, markIngestItemLinked } from '@/hooks/useStatementImport';
import { useAuth } from '@/hooks/useAuth';
import type { MailReviewItem } from '@/hooks/useMailReviewQueue';
import type { ExistingStatement } from '@/lib/statementFingerprint';

/**
 * KARTICA IZVODA u redu „Na pregled".
 *
 * Izvod NEMA polja računa (dobavljač, OIB, ukupno) — ta bi polja ovdje bila
 * laž. Prikazuje se ono što izvod stvarno nosi: banka, IBAN, razdoblje, broj i
 * novo stanje. Jedina radnja je „Uvezi izvod", koja predaje postojećem uvozu.
 */

interface Props {
  item: MailReviewItem;
  disabled?: boolean;
  onDiscard: () => void;
  /** Stavka je uvezena — nadređeni popis osvježava red i brojač. */
  onLinked: () => void;
}

export const StatementReviewCard = ({ item, disabled, onDiscard, onLinked }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const extraction = (item.extraction ?? {}) as Record<string, unknown>;
  const iban = normalizeIban(extraction.account_iban as string | null);
  const bankName = (extraction.bank_name as string | null) ?? null;

  const { customPaymentSources } = useCustomPaymentSources({ includePersonal: true });
  const { suggestSourceId, rememberRule } = useStatementSourceMemory(true);
  const { busy, startImport } = useStatementImport();

  const [sourceId, setSourceId] = useState<string>('');
  const [remember, setRemember] = useState(true);
  const [duplicate, setDuplicate] = useState<ExistingStatement | null>(null);
  const [awaitingImport, setAwaitingImport] = useState(false);

  // Prijedlog: povezani bankovni račun ima prednost nad ručnim pamćenjem.
  useEffect(() => {
    let cancelled = false;
    const suggest = async () => {
      if (!iban || sourceId) return;
      const fromBank = user?.id ? await suggestSourceFromBankAccounts(user.id, iban) : null;
      const next = fromBank ?? suggestSourceId(iban);
      if (!cancelled && next) setSourceId(next);
    };
    void suggest();
    return () => {
      cancelled = true;
    };
  }, [iban, sourceId, suggestSourceId, user?.id]);

  // Uvoz je stvarno zapisan (događaj iz globalnog uvoza) → stavka je `povezan`.
  useEffect(() => {
    if (!awaitingImport) return;
    const onDone = () => {
      setAwaitingImport(false);
      void markIngestItemLinked(item.id).then((ok) => {
        if (ok) {
          showSuccess(t('statements.imported', 'Izvod je uvezen'));
          onLinked();
        }
      });
    };
    window.addEventListener('vm:pdf-import-completed', onDone);
    return () => window.removeEventListener('vm:pdf-import-completed', onDone);
  }, [awaitingImport, item.id, onLinked, t]);

  const selectedSource = useMemo(
    () => customPaymentSources.find((s) => s.id === sourceId) ?? null,
    [customPaymentSources, sourceId],
  );

  const rows: { label: string; value: string }[] = [
    { label: t('statements.field.bank', 'Banka'), value: bankName || '—' },
    { label: t('statements.field.iban', 'IBAN računa'), value: iban || '—' },
    {
      label: t('statements.field.number', 'Broj izvoda'),
      value: String(extraction.statement_number ?? '') || '—',
    },
    {
      label: t('statements.field.period', 'Razdoblje'),
      value:
        extraction.period_from || extraction.period_to
          ? `${formatDateHr(String(extraction.period_from ?? '')) || '—'} – ${
              formatDateHr(String(extraction.period_to ?? '')) || '—'
            }`
          : '—',
    },
    {
      label: t('statements.field.closingBalance', 'Novo stanje'),
      value:
        extraction.closing_balance === null || extraction.closing_balance === undefined
          ? '—'
          : formatHrAmount(extraction.closing_balance as number),
    },
  ];

  const runImport = async (force: boolean) => {
    if (!selectedSource || !item.storage_path) return;
    setDuplicate(null);
    const result = await startImport({
      storagePath: item.storage_path,
      source: selectedSource,
      force,
    });
    if (result.kind === 'duplicate') {
      setDuplicate(result.existing);
      return;
    }
    if (result.kind === 'error') {
      showError(t('statements.importFailed', 'Otvaranje uvoza nije uspjelo'));
      return;
    }
    setAwaitingImport(true);
    if (remember && iban) {
      await rememberRule({
        iban,
        bankName,
        paymentSourceId: selectedSource.id,
        businessProfileId: selectedSource.business_profile_id ?? null,
      });
    }
  };

  return (
    <div
      data-testid="mail-statement-item"
      className="rounded-lg border border-l-4 border-l-primary bg-muted/30 p-3 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Landmark className="h-3 w-3" />
          {t('mailReview.classification.izvod', 'Bankovni izvod')}
        </Badge>
        <Badge variant="outline">{item.trust_level ?? 'T4'}</Badge>
      </div>

      <div className="text-xs text-muted-foreground break-all">
        {item.subject || t('mailImport.noSubject', '(bez naslova)')} · {item.from_header || '—'}
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="break-all text-right">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2 pt-1">
        <label className="text-xs text-muted-foreground">
          {t('statements.sourceLabel', 'Uvezi u novčanik')}
        </label>
        <Select value={sourceId} onValueChange={setSourceId} disabled={disabled || busy}>
          <SelectTrigger
            className="min-h-[44px]"
            aria-label={t('statements.sourceLabel', 'Uvezi u novčanik')}
          >
            <SelectValue placeholder={t('statements.sourcePlaceholder', 'Odaberi novčanik')} />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            {customPaymentSources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.icon} {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {iban && (
          <label
            data-testid="remember-statement-source"
            className="flex items-start gap-2 text-xs cursor-pointer"
          >
            <Checkbox
              className="mt-0.5"
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
            />
            <span>
              {t('statements.rememberSource', 'Zapamti: izvodi za {{iban}} idu u ovaj novčanik', {
                iban,
              })}
            </span>
          </label>
        )}
      </div>

      {duplicate && (
        <div
          data-testid="statement-duplicate"
          className="rounded-md border border-document-pending bg-document-pending-surface/40 p-2 text-xs"
        >
          {t('statements.duplicate', 'Ovaj izvod je već uvezen {{date}}.', {
            date: formatDateHr(duplicate.imported_at) || duplicate.imported_at,
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          className="min-h-[44px]"
          disabled={disabled || busy || !selectedSource || !item.storage_path}
          onClick={() => runImport(duplicate !== null)}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {duplicate
            ? t('statements.importAnyway', 'Uvezi ipak')
            : t('statements.import', 'Uvezi izvod')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-[44px]"
          disabled={disabled || busy}
          onClick={onDiscard}
        >
          <X className="h-4 w-4 mr-2" />
          {t('mailReview.discard', 'Odbaci')}
        </Button>
      </div>
    </div>
  );
};
