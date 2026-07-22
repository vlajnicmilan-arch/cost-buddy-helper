/**
 * FAZA 4 (t.2 + t.4) — Sekcija "Sidro salda" u postavkama novčanika.
 * Prikazuje trenutno sidro (datum, iznos, ljudsko porijeklo) i read-only
 * povijest poravnanja iz `anchor_audit`. Ne mijenja podatke direktno —
 * za korekciju zove existing `onCorrectBalance` (koji ide na
 * BalanceCorrectionDialog → set_source_anchor RPC).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Anchor, History, ShieldCheck, Wrench } from 'lucide-react';
import { format } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useCurrency } from '@/contexts/CurrencyContext';

type AnchorSource =
  | 'user_confirmed'
  | 'migration'
  | 'bank_reconciliation'
  | 'system_initial';

interface AnchorInfoSectionProps {
  sourceId: string;
  /** Otvara BalanceCorrectionDialog u parentu (Panel). */
  onCorrectBalance?: () => void;
}

interface AnchorState {
  date: string | null;
  balance: number | null;
  source: AnchorSource | null;
}

interface AuditRow {
  id: string;
  changed_at: string;
  old_anchor_balance: number | null;
  old_anchor_date: string | null;
  new_anchor_balance: number;
  new_anchor_date: string;
  anchor_source: AnchorSource;
  reason: string | null;
}

function useDateLocale() {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('hr') ? hr : i18n.language.startsWith('de') ? de : enUS;
}

export function AnchorInfoSection({ sourceId, onCorrectBalance }: AnchorInfoSectionProps) {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const dateLocale = useDateLocale();
  const [anchor, setAnchor] = useState<AnchorState>({ date: null, balance: null, source: null });
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Anchor kolone su na `custom_payment_sources` (correction_anchor_*).
      const [srcRes, auditRes] = await Promise.all([
        (supabase as any)
          .from('custom_payment_sources')
          .select('correction_anchor_date, correction_anchor_balance, anchor_source')
          .eq('id', sourceId)
          .maybeSingle(),
        (supabase as any)
          .from('anchor_audit')
          .select('id, changed_at, old_anchor_balance, old_anchor_date, new_anchor_balance, new_anchor_date, anchor_source, reason')
          .eq('source_id', sourceId)
          .order('changed_at', { ascending: false })
          .limit(100),
      ]);
      if (cancelled) return;
      const s = srcRes?.data ?? null;
      setAnchor({
        date: s?.correction_anchor_date ?? null,
        balance: s?.correction_anchor_balance ?? null,
        source: (s?.anchor_source as AnchorSource | null) ?? null,
      });
      setAudit(Array.isArray(auditRes?.data) ? auditRes.data : []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [sourceId]);

  const originLabel = useMemo(() => {
    switch (anchor.source) {
      case 'user_confirmed':      return t('anchor.origin.userConfirmed');
      case 'bank_reconciliation': return t('anchor.origin.bankReconciliation');
      case 'migration':           return t('anchor.origin.migration');
      case 'system_initial':      return t('anchor.origin.systemInitial');
      default:                    return t('anchor.origin.unknown');
    }
  }, [anchor.source, t]);

  const canConfirmReal =
    anchor.source === 'migration' || anchor.source === 'system_initial';

  const visibleAudit = showAll ? audit : audit.slice(0, 10);

  if (loading) return null;
  if (!anchor.date && audit.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Sidro */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Anchor className="w-4 h-4 text-primary" />
            {t('anchor.sectionTitle')}
          </div>
          <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        {anchor.date && anchor.balance !== null ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">{t('anchor.date')}</div>
              <div className="font-medium">
                {format(new Date(anchor.date), 'd. MMM yyyy', { locale: dateLocale })}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('anchor.balance')}</div>
              <div className="font-mono font-medium">{formatAmount(Number(anchor.balance))}</div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">{t('anchor.origin.label')}</div>
              <div className="font-medium">{originLabel}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('anchor.noAnchor')}</p>
        )}
        {canConfirmReal && onCorrectBalance && (
          <div className="pt-1 flex flex-col gap-1">
            <p className="text-[11px] text-muted-foreground">
              {t('anchor.confirmHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCorrectBalance}
              className="self-start"
            >
              <Wrench className="w-3.5 h-3.5 mr-1" />
              {t('anchor.confirmReal')}
            </Button>
          </div>
        )}
      </div>

      {/* Povijest poravnanja */}
      {audit.length > 0 && (
        <div className="rounded-lg border bg-card/50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History className="w-4 h-4 text-muted-foreground" />
            {t('anchor.historyTitle')}
            <span className="text-xs text-muted-foreground font-normal">({audit.length})</span>
          </div>
          <ul className="divide-y divide-border/60">
            {visibleAudit.map((row) => {
              const origin =
                row.anchor_source === 'user_confirmed' ? t('anchor.origin.userConfirmed') :
                row.anchor_source === 'bank_reconciliation' ? t('anchor.origin.bankReconciliation') :
                row.anchor_source === 'migration' ? t('anchor.origin.migration') :
                t('anchor.origin.systemInitial');
              return (
                <li key={row.id} className="py-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {format(new Date(row.changed_at), 'd. MMM yyyy HH:mm', { locale: dateLocale })}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      {origin}
                    </span>
                  </div>
                  <div className="font-mono">
                    {row.old_anchor_balance !== null ? formatAmount(Number(row.old_anchor_balance)) : '—'}
                    {' → '}
                    <span className="font-semibold">{formatAmount(Number(row.new_anchor_balance))}</span>
                  </div>
                  {row.reason && (
                    <div className="text-muted-foreground truncate">{row.reason}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {audit.length > 10 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? t('anchor.showLess') : t('anchor.showAll', { count: audit.length })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
