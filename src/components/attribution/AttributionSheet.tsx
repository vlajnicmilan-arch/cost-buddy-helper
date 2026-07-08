/**
 * AttributionSheet — radnik pripisuje primljenu isplatu jednom od svojih
 * izvora plaćanja. Otvara se preko CustomEvent-a iz notifications dropdowna
 * ili native push tap-a.
 *
 * Ključna pravila (v1.0):
 *  - Intent: `manual_entry` (event_at = now(), C2), date = paid_at::date.
 *  - Ciljni izvor: svi izvori dopušteni. Bank-linkani izvori idu s inline
 *    warningom (Varijanta B). Cross-currency izvori DISABLED s hintom.
 *  - Batch payout → jedan zbirni `expenses` red, worker_payout_batch_id.
 *  - Single payout  → jedan red, worker_payout_id (backward-compat).
 *  - Race guard: unique index (user_id, worker_payout*_id) — hvatamo 23505 i
 *    prikazujemo "Već pripisano". Nakon inicijalnog loada iste podatke drži
 *    `useIncomingPayoutAttribution.existing`.
 *  - Storno (`voided`): read-only info panel + link na eventualno pripisan
 *    unos. Bez auto-diranja radnikovih podataka.
 *  - Empty state (radnik nema izvora): CTA na `/wallet` čuvajući payoutIds
 *    kroz sessionStorage kako se sheet automatski otvara natrag.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, Loader2, Wallet as WalletIcon, ArrowRight } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useExpenses } from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { getBankLinkedSourceIds } from '@/lib/bankLinkedSources';
import { logFunnelEvent } from '@/lib/funnelTracking';
import { useIncomingPayoutAttribution } from '@/hooks/useIncomingPayoutAttribution';
import type { AttributionOpenPayload } from '@/lib/attribution/events';

const ATTRIBUTION_RESUME_KEY = 'vmb:attribution:resume';

/**
 * Perzistira otvoreni payload u sessionStorage kako se sheet može auto-otvoriti
 * nakon što se korisnik vrati s `/wallet` (dodavanje prvog izvora).
 */
export function persistAttributionResume(payload: AttributionOpenPayload) {
  try {
    sessionStorage.setItem(ATTRIBUTION_RESUME_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}
export function consumeAttributionResume(): AttributionOpenPayload | null {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_RESUME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(ATTRIBUTION_RESUME_KEY);
    const parsed = JSON.parse(raw) as AttributionOpenPayload;
    if (!parsed || !Array.isArray(parsed.payoutIds) || parsed.payoutIds.length === 0) return null;
    return parsed;
  } catch { return null; }
}

interface Props {
  open: boolean;
  payload: AttributionOpenPayload | null;
  onClose: () => void;
}

export function AttributionSheet({ open, payload, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { customPaymentSources, loading: sourcesLoading } = useCustomPaymentSources();
  const { addExpense } = useExpenses();

  const [bankLinkedIds, setBankLinkedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const payoutIds = useMemo(() => payload?.payoutIds ?? [], [payload]);
  const batchId = payload?.batchId ?? null;
  const isVoided = payload?.action === 'voided';

  const { loading, error, payouts, existing, refetch } = useIncomingPayoutAttribution(
    payoutIds,
    batchId,
    open,
  );

  // Reset lokalnog stanja kad se otvara/zatvara sheet
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSaving(false);
    }
  }, [open, payoutIds.join(',')]);

  // WS2 / Faza 2.1 — nakon resume-a iz "Dodaj izvor u Novčaniku" flow-a,
  // auto-predselektiraj prvi izvor čiji ID nije bio u snapshotu.
  useEffect(() => {
    if (!open) return;
    if (selectedId) return;
    const preIds = payload?.preSourceIds;
    if (!preIds || preIds.length === 0) return;
    if (!customPaymentSources || customPaymentSources.length === 0) return;
    const preSet = new Set(preIds);
    const fresh = customPaymentSources.find(s => !preSet.has(s.id));
    if (fresh) setSelectedId(fresh.id);
  }, [open, payload, customPaymentSources, selectedId]);

  // Bank-linkani izvori (za warning)
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    getBankLinkedSourceIds(user.id, null).then(ids => {
      if (!cancelled) setBankLinkedIds(ids);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, user]);

  // Aggregirani iznos + prikaz projekta iz RPC-a; fallback na payload iz notifikacije
  const totalAmount = useMemo(() => {
    if (payouts.length > 0) return payouts.reduce((s, p) => s + Number(p.paid_amount || 0), 0);
    return payload?.paidAmountTotal ?? 0;
  }, [payouts, payload]);
  const projectNames = useMemo(() => {
    if (payouts.length > 0) return Array.from(new Set(payouts.map(p => p.project_name)));
    return payload?.projectNames ?? [];
  }, [payouts, payload]);
  const paidAt = payouts.length > 0 ? payouts[0].paid_at : null;

  // Vrijedeći izvori za pripis: filter cross-currency (EUR default). Non-EUR = disabled.
  const sourcesWithMeta = useMemo(() => {
    return (customPaymentSources ?? []).map(s => {
      const cur = (s.currency ?? 'EUR').toUpperCase();
      const isCrossCurrency = cur !== 'EUR';
      const isBankLinked = bankLinkedIds.has(s.id);
      return { source: s, isCrossCurrency, isBankLinked };
    });
  }, [customPaymentSources, bankLinkedIds]);

  const eligibleSources = sourcesWithMeta.filter(x => !x.isCrossCurrency);
  const selected = eligibleSources.find(x => x.source.id === selectedId) ?? null;

  const disabledReason: string | null = (() => {
    if (isVoided) return null;
    if (!selectedId) return t('attribution.disabled.pickSource', 'Odaberi izvor isplate');
    if (!totalAmount || totalAmount <= 0) return t('attribution.disabled.noAmount', 'Iznos isplate nije poznat');
    if (existing) return t('attribution.disabled.alreadyAttributed', 'Već pripisano ovoj isplati');
    return null;
  })();

  const handleAttribute = async () => {
    if (!user || !selected || saving) return;
    if (!totalAmount || totalAmount <= 0) return;
    setSaving(true);
    try {
      const dateIso = paidAt ? new Date(paidAt) : new Date();
      await addExpense({
        expense: {
          amount: totalAmount,
          description: projectNames.length === 1
            ? t('attribution.descSingle', 'Isplata: {{name}}', { name: projectNames[0] })
            : t('attribution.descBatch', 'Zbirna isplata: {{names}}', {
                names: projectNames.join(', '),
              }),
          category: 'salary',
          type: 'income',
          date: dateIso,
          payment_source: `custom:${selected.source.id}`,
          receipt_url: null,
          merchant_name: null,
          ai_extracted: false,
          // linkovi na payout(e)
          ...(batchId
            ? { worker_payout_batch_id: batchId }
            : { worker_payout_id: payoutIds[0] }),
        } as any,
      });

      logFunnelEvent('worker_payout_attributed', {
        batch: !!batchId,
        payout_count: payoutIds.length,
        bank_linked_source: selected.isBankLinked,
        amount: totalAmount,
      }).catch(() => {});

      showSuccess(t('attribution.success', 'Isplata pripisana izvoru'));
      onClose();
    } catch (e: any) {
      // Race guard: unique_violation → već pripisano.
      if (e?.code === '23505') {
        await refetch();
        showError(t('attribution.errors.alreadyAttributed', 'Već pripisano ovoj isplati'));
      } else {
        console.error('[AttributionSheet] attribute failed', e);
        showError(t('attribution.errors.generic', 'Pripis nije uspio, pokušaj ponovno'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExisting = () => {
    if (!existing) return;
    onClose();
    navigate(`/wallet?highlight=${existing.id}`);
  };

  const handleAddSource = () => {
    if (payload) {
      // Snapshot postojećih izvora → nakon resume-a auto-predselektiramo novi.
      const snapshot = (customPaymentSources ?? []).map(s => s.id);
      persistAttributionResume({ ...payload, preSourceIds: snapshot });
    }
    onClose();
    navigate('/wallet?openSourceCreate=1');
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>
            {isVoided
              ? t('attribution.titleVoided', 'Isplata poništena')
              : t('attribution.title', 'Pripiši isplatu izvoru')}
          </SheetTitle>
          <SheetDescription>
            {projectNames.length > 0 ? projectNames.join(', ') : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Sažetak iznosa */}
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="text-xs text-muted-foreground">
              {batchId
                ? t('attribution.batchLabel', 'Zbirna isplata')
                : t('attribution.singleLabel', 'Isplata')}
            </div>
            <div className="text-2xl font-semibold mt-1">{formatAmount(totalAmount || 0)}</div>
            {paidAt && (
              <div className="text-xs text-muted-foreground mt-1">
                {t('attribution.paidAt', 'Uplaćeno')}: {new Date(paidAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.loading', 'Učitavanje…')}
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive">
              {t('attribution.errors.loadFailed', 'Ne mogu učitati podatke o isplati')}
            </div>
          )}

          {/* Storno mod */}
          {isVoided && !loading && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  {existing
                    ? t(
                        'attribution.voided.attributed',
                        'Isplata je poništena, a vi ste je već pripisali izvoru. Provjerite treba li unos stornirati ručno.',
                      )
                    : t(
                        'attribution.voided.notAttributed',
                        'Isplata je poništena. Ako ste je već pripisali svom izvoru, provjerite unos u novčaniku.',
                      )}
                </div>
              </div>
              {existing && (
                <Button variant="outline" size="sm" onClick={handleOpenExisting}>
                  {t('attribution.voided.openEntry', 'Otvori pripisan unos')}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          )}

          {/* Aktivni mod (created) */}
          {!isVoided && !loading && (
            <>
              {existing ? (
                <div className="rounded-lg border p-3 text-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>{t('attribution.alreadyAttributed', 'Ovu isplatu ste već pripisali izvoru.')}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleOpenExisting}>
                    {t('attribution.voided.openEntry', 'Otvori pripisan unos')}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              ) : sourcesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.loading', 'Učitavanje…')}
                </div>
              ) : sourcesWithMeta.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-center space-y-3">
                  <WalletIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                  <div>
                    {t(
                      'attribution.empty.text',
                      'Nemate niti jedan izvor plaćanja. Dodajte izvor u Novčaniku da biste pripisali isplatu.',
                    )}
                  </div>
                  <Button onClick={handleAddSource}>
                    {t('attribution.empty.cta', 'Dodaj izvor u Novčaniku')}
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="text-sm font-medium mb-2">
                    {t('attribution.pickSource', 'Odaberi svoj izvor')}
                  </div>
                  <div className="space-y-2">
                    {sourcesWithMeta.map(({ source, isCrossCurrency, isBankLinked }) => {
                      const disabled = isCrossCurrency;
                      const isSelected = selectedId === source.id;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedId(source.id)}
                          className={`w-full text-left rounded-lg border p-3 min-h-[44px] transition
                            ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{source.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{source.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatAmount(Number(source.balance) || 0)}
                                {source.currency && source.currency !== 'EUR' && ` · ${source.currency}`}
                              </div>
                            </div>
                          </div>
                          {isCrossCurrency && (
                            <div className="text-xs text-muted-foreground mt-2">
                              {t(
                                'attribution.warnings.crossCurrency',
                                '{{currency}} izvor — konverzija nije podržana u v1.',
                                { currency: (source.currency ?? '').toUpperCase() },
                              )}
                            </div>
                          )}
                          {isBankLinked && !isCrossCurrency && (
                            <div className="text-xs text-amber-700 mt-2 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>
                                {t(
                                  'attribution.warnings.bankLinked',
                                  'Izvor je spojen s bankom — kad uplata stigne sinkronizacijom, može doći do duplikata. Provjerite i obrišite jedan od unosa.',
                                )}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isVoided && !existing && sourcesWithMeta.length > 0 && (
          <div className="mt-6 space-y-2">
            <Button
              className="w-full"
              disabled={!!disabledReason || saving}
              onClick={handleAttribute}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('attribution.actions.attribute', 'Pripiši izvoru')}
            </Button>
            {disabledReason && (
              <div className="text-xs text-muted-foreground text-center">{disabledReason}</div>
            )}
            <Button variant="ghost" className="w-full" onClick={onClose} disabled={saving}>
              {t('attribution.actions.skip', 'Preskoči')}
            </Button>
          </div>
        )}

        {(isVoided || existing) && (
          <div className="mt-6">
            <Button variant="outline" className="w-full" onClick={onClose}>
              {t('common.close', 'Zatvori')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
