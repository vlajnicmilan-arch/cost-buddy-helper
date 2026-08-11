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
import { Landmark, Download, Loader2, Plus, X } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { formatDateHr } from '@/lib/dateFormat';
import { formatHrAmount } from '@/lib/money';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import {
  useStatementSourceMemory,
  suggestSourceFromBankAccounts,
} from '@/hooks/useStatementSourceMemory';
import { sanitizeIban } from '@/lib/mailImport/iban';
import {
  pickStatementSource,
  type StatementSourceMatchReason,
} from '@/lib/mail/statementSourceMatch';
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
  // Prljav IBAN (zalijepljen sljedeći redak) NE smije postati ključ pravila.
  const iban = sanitizeIban(extraction.account_iban as string | null);
  // E-novčanici (KEKS Pay) nemaju IBAN — identitet nosi „Broj računa".
  const accountNumber = String(extraction.account_number ?? '').replace(/[^0-9]/g, '') || null;
  const accountIdentifier = iban || accountNumber;
  const bankName = (extraction.bank_name as string | null) ?? null;

  // Picker mora nuditi izvore PROFILA NA KOJI STAVKA GLASI, ne aktivnog konteksta.
  const scopeProfileId =
    item.scope_type === 'business_profile' && item.scope_id ? item.scope_id : null;
  const { customPaymentSources, addCustomPaymentSource, updateCustomPaymentSource } = useCustomPaymentSources({
    includePersonal: true,
    businessProfileIdOverride: scopeProfileId,
  });
  const { suggestSourceId, rememberRule } = useStatementSourceMemory(true);
  const { busy, startImport } = useStatementImport();

  const [sourceId, setSourceId] = useState<string>('');
  const [matchReason, setMatchReason] = useState<StatementSourceMatchReason | null>(null);
  const [creatingSource, setCreatingSource] = useState(false);
  const [remember, setRemember] = useState(true);
  // Prvi uvoz nudi da IBAN ostane zapisan NA NOVČANIKU (ne samo kao pravilo).
  const [saveToWallet, setSaveToWallet] = useState(true);
  const [duplicate, setDuplicate] = useState<ExistingStatement | null>(null);
  const [awaitingImport, setAwaitingImport] = useState(false);

  // PREDODABIR: pravilo > IBAN mapiranje > ime banke ↔ ime novčanika.
  // Razlog se prikazuje ispod pickera da izbor nikad ne bude neobjašnjen.
  useEffect(() => {
    let cancelled = false;
    const suggest = async () => {
      if (sourceId || customPaymentSources.length === 0) return;
      const fromBank = iban && user?.id ? await suggestSourceFromBankAccounts(user.id, iban) : null;
      const match = pickStatementSource({
        ruleSourceId: accountIdentifier ? suggestSourceId(accountIdentifier) : null,
        accountIdentifier,
        bankAccountSourceId: fromBank,
        bankName,
        sources: customPaymentSources,
      });
      if (!cancelled && match) {
        setSourceId(match.sourceId);
        setMatchReason(match.reason);
      }
    };
    void suggest();
    return () => {
      cancelled = true;
    };
  }, [accountIdentifier, bankName, customPaymentSources, iban, sourceId, suggestSourceId, user?.id]);

  const matchReasonText =
    matchReason === 'rule'
      ? t('statements.matchReason.rule', 'Zapamćeno pravilo za ovaj račun')
      : matchReason === 'wallet_identifier'
        ? t('statements.matchReason.walletIdentifier', 'IBAN / broj računa upisan na novčaniku')
      : matchReason === 'bank_account'
        ? t('statements.matchReason.bankAccount', 'Povezani bankovni račun (IBAN)')
        : matchReason === 'bank_name'
          ? t('statements.matchReason.bankName', 'Ime novčanika odgovara banci s izvoda')
          : null;

  // Bez pogotka nudimo jedan dodir: stvori novčanik s imenom banke i odaberi ga.
  const canCreateFromBank = !sourceId && !!bankName?.trim();

  const createSourceFromBank = async () => {
    if (!bankName?.trim() || creatingSource) return;
    setCreatingSource(true);
    try {
      const created = await addCustomPaymentSource({
        name: bankName.trim(),
        icon: '🏦',
        color: 'hsl(172 66% 40%)',
        balance: 0,
        currency: (extraction.currency as string | null) || 'EUR',
        business_profile_id: scopeProfileId,
      });
      if (created?.id) {
        setSourceId(created.id);
        setMatchReason(null);
      }
    } finally {
      setCreatingSource(false);
    }
  };


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

  // Ponuda spremanja: samo kad izvod nosi identitet, a odabrani novčanik ga
  // još nema i korisnik je njegov vlasnik (tuđi novčanik se ne dira).
  const offerSaveToWallet =
    !!accountIdentifier &&
    !!selectedSource &&
    selectedSource.isOwned !== false &&
    !String(selectedSource.account_identifier ?? '').trim();

  const rows: { label: string; value: string }[] = [
    { label: t('statements.field.bank', 'Banka'), value: bankName || '—' },
    iban || !accountNumber
      ? { label: t('statements.field.iban', 'IBAN računa'), value: iban || '—' }
      : { label: t('statements.field.accountNumber', 'Broj računa'), value: accountNumber },
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
      closingBalance:
        typeof extraction.closing_balance === 'number' ? extraction.closing_balance : null,
      statementDate: (extraction.period_to as string | null) ?? null,
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
    if (saveToWallet && offerSaveToWallet && accountIdentifier) {
      await updateCustomPaymentSource(selectedSource.id, {
        account_identifier: accountIdentifier,
      });
    }
    if (remember && accountIdentifier) {
      await rememberRule({
        identifier: accountIdentifier,
        iban: iban || null,
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
        <Select
          value={sourceId}
          onValueChange={(v) => {
            setSourceId(v);
            setMatchReason(null);
          }}
          disabled={disabled || busy}
        >
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

        {matchReasonText && (
          <p data-testid="statement-source-reason" className="text-xs text-muted-foreground">
            {matchReasonText}
          </p>
        )}

        {canCreateFromBank && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="statement-create-source"
            className="min-h-[44px] w-full justify-start"
            disabled={disabled || busy || creatingSource}
            onClick={() => void createSourceFromBank()}
          >
            {creatingSource ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {t('statements.createSource', 'Stvori novi novčanik „{{name}}"', {
              name: bankName?.trim() ?? '',
            })}
          </Button>
        )}


        {offerSaveToWallet && (
          <label
            data-testid="save-identifier-to-wallet"
            className="flex items-start gap-2 text-xs cursor-pointer"
          >
            <Checkbox
              className="mt-0.5"
              checked={saveToWallet}
              onCheckedChange={(v) => setSaveToWallet(v === true)}
            />
            <span>
              {t('statements.saveIdentifierToWallet', 'Spremi ovaj IBAN na novčanik „{{name}}"', {
                name: selectedSource?.name ?? '',
              })}
            </span>
          </label>
        )}

        {accountIdentifier && (
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
                iban: accountIdentifier,
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
