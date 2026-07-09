import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { parseLocaleAmount } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, RotateCcw, FolderKanban, PiggyBank, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Category, getCategoryInfo, CATEGORIES, PaymentSource } from '@/types/expense';
import { CustomPaymentSource } from '@/types/customPaymentSource';
import { CustomCategory } from '@/types/customCategory';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { PaymentSourceOptions } from './PaymentSourceOptions';
import type { KrugSelectorPrivacy } from '@/components/krug/KrugSelector';
import { AttachmentBar } from './AttachmentBar';

interface ScannedData {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
  date: string | null;
  payment_source: PaymentSource | null;
  custom_payment_source_id: string | null;
  payment_source_card_id: string | null;
  items: { name: string; quantity: number; total_price: number; unit_price?: number }[];
  is_installment?: boolean;
  installment_count?: number | null;
  installment_amount?: number | null;
  transaction_type?: 'expense' | 'transfer' | 'income';
  transfer_destination_name?: string | null;
  recipient_name?: string | null;
  issuer_name?: string | null;
  issuer_oib?: string | null;
  /**
   * Val 4 — očitani ISO timestamp izdavanja računa (s vremenom). Prikazuje
   * se read-only uz datum kako bi korisnik mogao provjeriti je li točno.
   * Editiranje vremena nije podržano u ovom passu.
   */
  issued_at_iso?: string | null;
}

interface ScannedDataPreviewProps {
  scannedData: ScannedData;
  onScannedDataChange: (data: ScannedData) => void;
  receiptImage: string | null;
  receiptImages: string[];
  customPaymentSources: CustomPaymentSource[];
  customCategories: CustomCategory[];
  projects: { id: string; name: string; color?: string | null; icon?: string | null }[];
  budgets: { id: string; name: string; color?: string | null; icon?: string | null; is_active?: boolean | null }[];
  selectedProjectId: string | null;
  onSelectedProjectIdChange: (id: string | null) => void;
  selectedBudgetId: string | null;
  onSelectedBudgetIdChange: (id: string | null) => void;
  expenseNature: 'regular' | 'extraordinary';
  onExpenseNatureChange: (nature: 'regular' | 'extraordinary') => void;
  totalWithTip: string;
  onTotalWithTipChange: (value: string) => void;
  saveReceipt: boolean;
  onSaveReceiptChange: (value: boolean) => void;
  isSaving: boolean;
  onAccept: () => void;
  onReject: () => void;
  /**
   * Val 4 — pozove se kad korisnik ručno promijeni datum (ili vrijeme) u
   * preview koraku. Tier-odluka u write-pathu mora zbog toga pasti na C3.
   * Optional: stari pozivi ne moraju ga proslijediti — odsutnost se tretira
   * kao da edit nije zabilježen (i scan-C1 ostaje moguć).
   */
  onDateOrTimeEdited?: () => void;
  /**
   * WS2a — Krug entry parity. Scan preview pruža isti Krug izbor kao manual
   * form. Selector se renderira samo kad je `showKrugSelector` true i tip
   * transakcije nije `transfer`. Business kontekst gasi selector kroz
   * `showKrugSelector={false}` na roditelju (AddExpenseDialog).
   */
  showKrugSelector?: boolean;
  krugId?: string | null;
  krugPrivacy?: KrugSelectorPrivacy;
  onKrugChange?: (next: { krugId: string | null; privacy: KrugSelectorPrivacy }) => void;
}

export const ScannedDataPreview = ({
  scannedData,
  onScannedDataChange,
  receiptImage,
  receiptImages,
  customPaymentSources,
  customCategories,
  projects,
  budgets,
  selectedProjectId,
  onSelectedProjectIdChange,
  selectedBudgetId,
  onSelectedBudgetIdChange,
  expenseNature,
  onExpenseNatureChange,
  totalWithTip,
  onTotalWithTipChange,
  saveReceipt,
  onSaveReceiptChange,
  isSaving,
  onAccept,
  onReject,
  onDateOrTimeEdited,
  showKrugSelector = false,
  krugId = null,
  krugPrivacy = 'personal',
  onKrugChange,
}: ScannedDataPreviewProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { activeBusinessProfileId } = useAppState();

  // Diagnostic: confirm that ScannedDataPreview actually mounts in the DOM
  // and how long it stays alive. Critical signal for the business-mode
  // "preview never appears" issue.
  useEffect(() => {
    try {
      logDiagnostic('scanned_preview_mounted', {
        has_amount: !!scannedData?.amount,
        sources_count: customPaymentSources?.length ?? 0,
        business: !!activeBusinessProfileId,
      });
    } catch {}
    return () => {
      try { logDiagnostic('scanned_preview_unmounted', {}); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryInfo = (() => {
    const custom = customCategories.find(c => c.id === scannedData.category || c.name === scannedData.category);
    if (custom) return { id: custom.id, name: custom.name, icon: custom.icon, color: custom.color };
    return getCategoryInfo(scannedData.category);
  })();
  const invalidTip = totalWithTip ? parseLocaleAmount(totalWithTip).value < scannedData.amount : false;

  return (
    <div className="h-full max-h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-4 px-1">
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-primary flex items-center gap-2">
            <Check className="w-4 h-4" />
            {t('scanner.foundData')}
          </h3>
        </div>
        
        {receiptImages.length > 1 ? (
          <div className="flex gap-1 overflow-x-auto rounded-lg h-20">
            {receiptImages.map((img, idx) => (
              <img key={idx} src={img} alt={`Stranica ${idx + 1}`} className="h-full w-auto object-cover rounded-lg flex-shrink-0" />
            ))}
          </div>
        ) : receiptImage ? (
          <div className="relative rounded-lg overflow-hidden h-20">
            <img src={receiptImage} alt="Račun" className="w-full h-full object-cover" />
          </div>
        ) : null}

        {/* Transaction type selector */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-sm">Tip transakcije:</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onScannedDataChange({ ...scannedData, transaction_type: 'expense', transfer_destination_name: null })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scannedData.transaction_type === 'expense'
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              💸 Trošak
            </button>
            <button
              type="button"
              onClick={() => onScannedDataChange({ ...scannedData, transaction_type: 'income' })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scannedData.transaction_type === 'income'
                  ? 'bg-income/10 border-income/30 text-income'
                  : 'bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              💳 Uplata
            </button>
            <button
              type="button"
              onClick={() => onScannedDataChange({ ...scannedData, transaction_type: 'transfer' })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scannedData.transaction_type === 'transfer'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground'
              }`}
            >
              🔄 Prijenos
            </button>
          </div>
        </div>

        {/* Recipient info */}
        {scannedData.recipient_name && scannedData.transaction_type !== 'transfer' && (
          <div className="p-2 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground">
              Primatelj: <span className="font-medium text-foreground">{scannedData.recipient_name}</span>
            </p>
          </div>
        )}

        {/* Transfer destination info */}
        {scannedData.transaction_type === 'transfer' && (
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span>🔄</span>
              <span>Prijenos{scannedData.transfer_destination_name ? ` → ${scannedData.transfer_destination_name}` : (scannedData.recipient_name ? ` → ${scannedData.recipient_name}` : '')}</span>
            </div>
            {(scannedData.transfer_destination_name || scannedData.recipient_name) && (() => {
              const destName = (scannedData.transfer_destination_name || scannedData.recipient_name || '').toLowerCase();
              const matched = customPaymentSources.find(
                s => s.name.toLowerCase().includes(destName) || destName.includes(s.name.toLowerCase())
              );
              return matched ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo računa "{matched.name}" će se automatski uvećati za €{scannedData.amount.toFixed(2)}
                </p>
              ) : (
                <p className="text-xs text-destructive mt-1">
                  Račun "{scannedData.transfer_destination_name || scannedData.recipient_name}" nije pronađen. Saldo se neće ažurirati.
                </p>
              );
            })()}
          </div>
        )}
        
        {/* Issuer info */}
        {(scannedData.issuer_name || scannedData.issuer_oib) && (
          <div className="p-2 rounded-lg bg-muted/30 border border-border/50 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Izdavatelj: <span className="font-medium text-foreground">{scannedData.issuer_name || scannedData.merchant}</span>
              {scannedData.issuer_oib && <span className="ml-1 text-muted-foreground">(OIB: {scannedData.issuer_oib})</span>}
            </p>
          </div>
        )}

        {/* PDV modul je uklonjen — više se ne prikazuje ni izračunava. */}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t('common.amount')}:</span>
            <p className="font-bold text-lg">€{scannedData.amount.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('common.date')}:</span>
            <Input
              type="date"
              value={scannedData.date || ''}
              onChange={(e) => {
                onDateOrTimeEdited?.();
                onScannedDataChange({ ...scannedData, date: e.target.value || null });
              }}
              className="mt-1 h-10 rounded-lg text-sm"
            />
            {(() => {
              const iso = scannedData.issued_at_iso;
              if (!iso) return null;
              try {
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return null;
                const time = new Intl.DateTimeFormat('hr-HR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Zagreb',
                }).format(d);
                return (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('scanner.timeReadOnly', { time, defaultValue: 'Očitano vrijeme: {{time}}' })}
                  </p>
                );
              } catch {
                return null;
              }
            })()}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-muted-foreground text-sm">{t('scanner.merchant')}:</span>
          <Input
            value={scannedData.merchant || ''}
            onChange={(e) => onScannedDataChange({ ...scannedData, merchant: e.target.value })}
            className="rounded-lg text-sm"
            placeholder={t('scanner.merchant')}
          />
        </div>

        {/* Editable Category */}
        <div className="space-y-1">
          <span className="text-muted-foreground text-sm">{t('common.category')}:</span>
          <Select
            value={scannedData.category}
            onValueChange={(value) => onScannedDataChange({ ...scannedData, category: value as Category })}
          >
            <SelectTrigger className="w-full rounded-lg">
              <SelectValue>
                {categoryInfo?.icon} {categoryInfo?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {customCategories.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {t('categories.custom', 'Prilagođene')}
                  </div>
                  {customCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span 
                          className="w-5 h-5 rounded flex items-center justify-center text-xs"
                          style={{ backgroundColor: cat.color + '20', color: cat.color }}
                        >
                          {cat.icon}
                        </span>
                        <span>{cat.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </>
              )}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {t('paymentSources.standardSources', 'Standardne')}
              </div>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <span className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span>{t(`categories.${cat.id}`)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tip field */}
        {scannedData.transaction_type !== 'transfer' && (
          <div className="space-y-2 p-3 bg-background/60 rounded-lg border border-border/50">
            <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
              🫰 Sa napojnicom (ukupno):
            </Label>
            <MoneyInput
              placeholder={`npr. ${(scannedData.amount + 2).toFixed(2)}`}
              value={totalWithTip}
              onChange={(e) => onTotalWithTipChange(e.target.value)}
              className="rounded-lg text-sm"
            />
            {totalWithTip && parseLocaleAmount(totalWithTip).value > scannedData.amount && (
              <div className="flex items-center justify-between p-2 rounded-md bg-income/10 border border-income/20">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🫰</span>
                  <span className="text-sm font-medium text-income">Napojnica</span>
                </div>
                <span className="text-sm font-bold text-income">
                  +{formatAmount(parseLocaleAmount(totalWithTip).value - scannedData.amount)}
                </span>
              </div>
            )}
            {invalidTip && (
              <p className="text-xs text-destructive">Iznos ne može biti manji od iznosa s računa</p>
            )}
          </div>
        )}

        {/* Installment indicator */}
        {scannedData.is_installment && scannedData.installment_count && (
          <div className="p-3 bg-accent/10 border border-accent/30 rounded-lg">
            <p className="text-sm font-medium text-accent-foreground flex items-center gap-2">
              💳 Kupnja na rate: {scannedData.installment_count} rata
              {scannedData.installment_amount && ` × €${scannedData.installment_amount.toFixed(2)}`}
            </p>
          </div>
        )}

        {/* Payment source selector */}
        <div className="space-y-2">
          <span className="text-muted-foreground text-sm">{t('common.paymentSource')}:</span>
          <Select
            value={scannedData.custom_payment_source_id 
              ? `custom:${scannedData.custom_payment_source_id}` 
              : (scannedData.payment_source || 'cash')}
            onValueChange={(value) => {
              if (value.startsWith('custom:')) {
                const customId = value.replace('custom:', '');
                onScannedDataChange({
                  ...scannedData,
                  custom_payment_source_id: customId,
                  payment_source: null,
                  payment_source_card_id: null
                });
              } else {
                onScannedDataChange({
                  ...scannedData,
                  custom_payment_source_id: null,
                  payment_source: value as PaymentSource,
                  payment_source_card_id: null
                });
              }
            }}
          >
            <SelectTrigger className="w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <PaymentSourceOptions
                customPaymentSources={customPaymentSources}
                customValuePrefix="custom:"
                currentValue={
                  scannedData.custom_payment_source_id
                    ? `custom:${scannedData.custom_payment_source_id}`
                    : (scannedData.payment_source || 'cash')
                }
              />
            </SelectContent>
          </Select>

          {/* Business-mode hint: personal source selected → owner loan will be created */}
          {(() => {
            if (!activeBusinessProfileId) return null;
            const selectedId = scannedData.custom_payment_source_id;
            if (!selectedId) return null;
            const selected = customPaymentSources.find(s => s.id === selectedId);
            if (!selected) return null;
            if (selected.business_profile_id === activeBusinessProfileId) return null;
            return (
              <div className="text-xs rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <span aria-hidden>🪙</span>
                <span>{t('business.payment.willCreateOwnerLoan', 'Bit će zabilježeno kao pozajmica vlasnika prema tvrtki.')}</span>
              </div>
            );
          })()}

          {/* Card selector for custom source */}
          {scannedData.custom_payment_source_id && (() => {
            const selectedSource = customPaymentSources.find(s => s.id === scannedData.custom_payment_source_id);
            if (selectedSource?.cards && selectedSource.cards.length > 0) {
              return (
                <Select
                  value={scannedData.payment_source_card_id || 'none'}
                  onValueChange={(value) => {
                    onScannedDataChange({
                      ...scannedData,
                      payment_source_card_id: value === 'none' ? null : value
                    });
                  }}
                >
                  <SelectTrigger className="w-full rounded-lg">
                    <SelectValue placeholder={t('paymentSources.selectCard')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('paymentSources.noCard')}</SelectItem>
                    {selectedSource.cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        <span className="flex items-center gap-2">
                          <span>💳</span>
                          <span>{card.card_name} ****{card.last_four_digits}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            }
            return null;
          })()}
        </div>
        
        <div className="space-y-1">
          <span className="text-muted-foreground text-sm">{t('common.description')}:</span>
          <Input
            value={scannedData.description}
            onChange={(e) => onScannedDataChange({ ...scannedData, description: e.target.value })}
            className="rounded-lg text-sm"
            placeholder={t('common.description')}
          />
        </div>
        
        {scannedData.items.length > 0 && (
          <div>
            <span className="text-muted-foreground text-sm">
              {t('scanner.itemsFound')} ({scannedData.items.length}):
            </span>
            <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
              {scannedData.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs bg-background/50 px-2 py-1 rounded">
                  <span className="truncate flex-1">{item.name}</span>
                  <span className="font-mono ml-2">€{item.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attachment bar: Projekt / Budžet / Krug — parity s ManualExpenseForm.
            Scan surface zadržava mutual-exclusion između projekta i budžeta. */}
        <AttachmentBar
          showProject={(projects?.length ?? 0) > 0}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectedProjectIdChange={onSelectedProjectIdChange}
          showBudget={(budgets?.length ?? 0) > 0}
          budgets={budgets}
          selectedBudgetId={selectedBudgetId}
          onSelectedBudgetIdChange={onSelectedBudgetIdChange}
          showKrug={!!showKrugSelector && scannedData.transaction_type !== 'transfer' && !!onKrugChange}
          krugId={krugId}
          krugPrivacy={krugPrivacy}
          onKrugChange={onKrugChange}
          mutuallyExclusiveProjectBudget
        />


        {(selectedProjectId || selectedBudgetId) && (
          <div className="space-y-2">
            <span className="text-muted-foreground text-sm">{t('transactions.expenseNature', 'Vrsta troška')}:</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={expenseNature === 'regular' ? 'default' : 'outline'}
                className="flex-1 text-sm"
                onClick={() => onExpenseNatureChange('regular')}
              >
                <span className="w-2 h-2 rounded-full bg-income mr-2" />
                {t('transactions.regular', 'Redovan')}
              </Button>
              <Button
                type="button"
                variant={expenseNature === 'extraordinary' ? 'destructive' : 'outline'}
                className="flex-1 text-sm"
                onClick={() => onExpenseNatureChange('extraordinary')}
              >
                <span className="w-2 h-2 rounded-full bg-destructive mr-2" />
                {t('transactions.extraordinary', 'Vanredan')}
              </Button>
            </div>
          </div>
        )}

        <div className="pt-2">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="save-receipt-preview" 
              checked={saveReceipt}
              onCheckedChange={(checked) => onSaveReceiptChange(checked as boolean)}
            />
            <label 
              htmlFor="save-receipt-preview" 
              className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3" />
              {t('scanner.saveImage')}
            </label>
          </div>
          {saveReceipt && (
            <p className="text-xs text-muted-foreground/70 ml-4 mt-1">{t('scanner.saveImageHint')}</p>
          )}
        </div>
      </div>
      
      </div>

      <div className="flex-shrink-0 flex gap-2 pt-3 border-t border-border/50 bg-background px-1 pb-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-2 rounded-xl"
          onClick={onReject}
        >
          <RotateCcw className="w-4 h-4" />
          {t('scanner.reject')}
        </Button>
        <Button
          type="button"
          className="flex-1 gap-2 rounded-xl bg-primary h-12"
          onClick={onAccept}
          disabled={isSaving || invalidTip}
        >
          <Check className="w-4 h-4" />
          {isSaving ? t('common.saving') : t('scanner.accept')}
        </Button>
      </div>
    </div>
  );
};
