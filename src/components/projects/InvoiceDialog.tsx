import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProjectInvoices, ProjectInvoice, InvoiceItem } from '@/hooks/useProjectInvoices';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Loader2, Info, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';
import { showError } from '@/hooks/useStatusFeedback';

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ProjectInvoice | null;
  /** Pre-fill project link when creating from a project view. */
  projectId?: string | null;
  /** Pre-fill from accepted estimate (description, client, items). */
  prefillFromEstimateId?: string | null;
}

export const InvoiceDialog = ({ open, onOpenChange, invoice, projectId, prefillFromEstimateId }: InvoiceDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const { activeBusinessProfileId } = useAppState();
  const { addInvoice, updateInvoice } = useProjectInvoices();
  const [isVatPayer, setIsVatPayer] = useState(true);
  const [vatExemptionNote, setVatExemptionNote] = useState('');

  useEffect(() => {
    if (!activeBusinessProfileId) return;
    supabase
      .from('business_profiles')
      .select('is_vat_payer, vat_exemption_note')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) {
          setIsVatPayer(!!data.is_vat_payer);
          setVatExemptionNote(data.vat_exemption_note || '');
        }
      });
  }, [activeBusinessProfileId]);

  const DEFAULT_VAT = isVatPayer ? 25 : 0;

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const [clientName, setClientName] = useState('');
  const [clientOib, setClientOib] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: DEFAULT_VAT }]);
  const [issueDate, setIssueDate] = useState<string>(todayIso());
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [autoReminders, setAutoReminders] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setClientName(invoice.client_name);
      setClientOib(invoice.client_oib || '');
      setClientAddress(invoice.client_address || '');
      setItems(invoice.items.length > 0 ? invoice.items : [{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: DEFAULT_VAT }]);
      setIssueDate(invoice.issue_date || todayIso());
      setDueDate(invoice.due_date || '');
      setNotes(invoice.notes || '');
      setClientEmail(invoice.client_email || '');
      setAutoReminders(!!invoice.auto_reminders_enabled);
      return;
    }

    // Create mode — optionally prefill from an estimate
    const prefill = async () => {
      if (prefillFromEstimateId) {
        const { data } = await (supabase
          .from('project_estimates') as any)
          .select('client_name, client_oib, client_address, items, notes')
          .eq('id', prefillFromEstimateId)
          .single();
        if (data) {
          setClientName(data.client_name || '');
          setClientOib(data.client_oib || '');
          setClientAddress(data.client_address || '');
          const its = Array.isArray(data.items) ? data.items : [];
          setItems(its.length > 0 ? its : [{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: DEFAULT_VAT }]);
          setNotes(data.notes || (!isVatPayer && vatExemptionNote ? vatExemptionNote : ''));
          setIssueDate(todayIso());
          setDueDate('');
          return;
        }
      }
      setClientName('');
      setClientOib('');
      setClientAddress('');
      setItems([{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: DEFAULT_VAT }]);
      setIssueDate(todayIso());
      setDueDate('');
      setNotes(!isVatPayer && vatExemptionNote ? vatExemptionNote : '');
      setClientEmail('');
      setAutoReminders(false);
    };
    void prefill();
  }, [open, invoice, prefillFromEstimateId, DEFAULT_VAT, isVatPayer, vatExemptionNote]);

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
    setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: DEFAULT_VAT }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const vatAmount = items.reduce((s, it) => {
    const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    return s + lineTotal * ((Number(it.vat_rate) || 0) / 100);
  }, 0);
  const total = subtotal + vatAmount;

  const handleSave = async () => {
    if (!clientName.trim()) return;
    if (!activeBusinessProfileId) {
      showError(t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        client_name: clientName.trim(),
        client_oib: clientOib.trim() || null,
        client_address: clientAddress.trim() || null,
        items,
        subtotal,
        vat_amount: vatAmount,
        total_amount: total,
        currency: currency.code || 'EUR',
        status: invoice?.status || ('issued' as const),
        issue_date: issueDate || todayIso(),
        due_date: dueDate || null,
        notes: notes.trim() || null,
        project_id: invoice?.project_id ?? projectId ?? null,
        estimate_id: invoice?.estimate_id ?? prefillFromEstimateId ?? null,
        client_email: clientEmail.trim() || null,
        auto_reminders_enabled: autoReminders,
      };

      let saved: ProjectInvoice | null = null;
      if (invoice) {
        await updateInvoice(invoice.id, payload);
        saved = { ...invoice, ...payload } as ProjectInvoice;
      } else {
        saved = await addInvoice(payload);
        if (!saved) {
          // addInvoice already surfaced an error toast; keep dialog open so user can retry.
          return;
        }
      }

      // If auto-reminders are enabled, upload a PDF snapshot so the cron
      // dispatcher can sign and attach a download link. Best-effort.
      if (saved && autoReminders && clientEmail.trim()) {
        try {
          const { uploadInvoicePdfSnapshot } = await import('@/lib/invoicePdfUpload');
          await uploadInvoicePdfSnapshot(saved);
        } catch (e) {
          console.warn('PDF snapshot upload failed', e);
        }
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? t('invoices.edit', 'Uredi račun') : t('invoices.add', 'Novi račun')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!activeBusinessProfileId && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-xs">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-destructive" />
              <span className="text-foreground">
                {t('invoices.errors.noBusinessContext', 'Računi se mogu kreirati samo u kontekstu tvrtke. Prebaci se na tvrtku na dashboardu.')}
              </span>
            </div>
          )}
          {!isVatPayer && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/60 border border-border text-xs">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
              <span className="text-muted-foreground">
                {t('invoices.nonVatPreset', 'Niste obveznik PDV-a — sve stavke imaju 0% PDV-a, a napomena o izuzeću automatski je dodana.')}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('invoices.clientName', 'Naziv klijenta')} *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>{t('invoices.clientOib', 'OIB')}</Label>
              <Input value={clientOib} onChange={(e) => setClientOib(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('invoices.clientAddress', 'Adresa')}</Label>
            <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              {t('invoices.clientEmail', 'Email klijenta')}
            </Label>
            <Input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="klijent@example.com"
              autoComplete="off"
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer p-2.5 rounded-md bg-muted/30 border border-border/40">
            <Checkbox
              checked={autoReminders}
              onCheckedChange={(v) => setAutoReminders(!!v)}
              className="mt-0.5"
              disabled={!clientEmail.trim()}
            />
            <div className="text-xs">
              <p className="font-medium">{t('invoices.autoReminders.title', 'Automatski podsjetnici')}</p>
              <p className="text-muted-foreground mt-0.5">
                {t('invoices.autoReminders.hint', 'Šalji email klijentu 3., 7. i 14. dan kašnjenja (zahtjeva email).')}
              </p>
            </div>
          </label>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t('invoices.items', 'Stavke')}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('invoices.addItem', 'Dodaj')}
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                return (
                  <div key={idx} className="p-2 rounded border space-y-2">
                    <div className="relative">
                      <Input
                        placeholder={t('invoices.itemDescription', 'Opis')}
                        value={item.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        className="pr-12"
                      />
                      <VoiceInputButton
                        value={item.description}
                        onChange={(v) => updateItem(idx, { description: v })}
                        className="absolute top-1/2 -translate-y-1/2 right-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-12 gap-1">
                      <Input className="col-span-3" type="number" placeholder="Kol" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                      <Input className="col-span-2" placeholder="Jed" value={item.unit || 'kom'} onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                      <Input className="col-span-3" type="number" placeholder="Cijena" value={item.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                      <Input className="col-span-2" type="number" placeholder="PDV%" value={item.vat_rate} onChange={(e) => updateItem(idx, { vat_rate: Number(e.target.value) })} />
                      <div className="col-span-2 flex items-center justify-between gap-1">
                        <span className="text-xs font-medium">{lineTotal.toFixed(2)}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
            <div className="flex justify-between"><span>{t('invoices.subtotal', 'Osnovica')}:</span><span>{subtotal.toFixed(2)} {currency.symbol}</span></div>
            <div className="flex justify-between"><span>{t('invoices.vat', 'PDV')}:</span><span>{vatAmount.toFixed(2)} {currency.symbol}</span></div>
            <div className="flex justify-between font-bold pt-1 border-t"><span>{t('invoices.total', 'Ukupno')}:</span><span>{total.toFixed(2)} {currency.symbol}</span></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('invoices.issueDate', 'Datum izdavanja')} *</Label>
              {(() => {
                const r = getDateRange('budget');
                return (
                  <Input
                    type="date"
                    value={issueDate}
                    min={toInputDate(r.min)}
                    max={toInputDate(r.max)}
                    onChange={(e) => setIssueDate(e.target.value)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const errKey = getDateValidationKey(v, r);
                      if (errKey) {
                        setIssueDate(clampInputDate(v, r));
                        showError(t(errKey));
                      }
                    }}
                  />
                );
              })()}
            </div>
            <div className="space-y-1">
              <Label>{t('invoices.dueDate', 'Dospijeće')}</Label>
              {(() => {
                const r = getDateRange('budget');
                return (
                  <Input
                    type="date"
                    value={dueDate}
                    min={toInputDate(r.min)}
                    max={toInputDate(r.max)}
                    onChange={(e) => setDueDate(e.target.value)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const errKey = getDateValidationKey(v, r);
                      if (errKey) {
                        setDueDate(clampInputDate(v, r));
                        showError(t(errKey));
                      }
                    }}
                  />
                );
              })()}
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t('invoices.notes', 'Napomena')}</Label>
            <div className="relative">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="pr-12" />
              <VoiceInputButton value={notes} onChange={setNotes} className="absolute bottom-2 right-2" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Odustani')}</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !clientName.trim() || !activeBusinessProfileId}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {invoice ? t('common.save', 'Spremi') : t('common.create', 'Kreiraj')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
