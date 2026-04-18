import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProjectEstimates, ProjectEstimate, EstimateItem } from '@/hooks/useProjectEstimates';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface EstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimate: ProjectEstimate | null;
}

const VAT_RATE = 0.25;

export const EstimateDialog = ({ open, onOpenChange, estimate }: EstimateDialogProps) => {
  const { t } = useTranslation();
  const { currency } = useCurrency();
  const { addEstimate, updateEstimate } = useProjectEstimates();

  const [clientName, setClientName] = useState('');
  const [clientOib, setClientOib] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [items, setItems] = useState<EstimateItem[]>([{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: VAT_RATE * 100 }]);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && estimate) {
      setClientName(estimate.client_name);
      setClientOib(estimate.client_oib || '');
      setClientAddress(estimate.client_address || '');
      setItems(estimate.items.length > 0 ? estimate.items : [{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: VAT_RATE * 100 }]);
      setValidUntil(estimate.valid_until || '');
      setNotes(estimate.notes || '');
    } else if (open) {
      setClientName('');
      setClientOib('');
      setClientAddress('');
      setItems([{ description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: VAT_RATE * 100 }]);
      setValidUntil('');
      setNotes('');
    }
  }, [open, estimate]);

  const updateItem = (idx: number, patch: Partial<EstimateItem>) => {
    setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0, unit: 'kom', vat_rate: VAT_RATE * 100 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const vatAmount = items.reduce((s, it) => {
    const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    return s + lineTotal * ((Number(it.vat_rate) || 0) / 100);
  }, 0);
  const total = subtotal + vatAmount;

  const handleSave = async () => {
    if (!clientName.trim()) return;
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
        status: estimate?.status || 'draft' as const,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        accepted_project_id: estimate?.accepted_project_id || null,
      };

      if (estimate) {
        await updateEstimate(estimate.id, payload);
      } else {
        await addEstimate(payload);
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
          <DialogTitle>{estimate ? t('estimates.edit', 'Uredi ponudu') : t('estimates.add', 'Nova ponuda')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('estimates.clientName', 'Naziv klijenta')} *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>{t('estimates.clientOib', 'OIB')}</Label>
              <Input value={clientOib} onChange={(e) => setClientOib(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('estimates.clientAddress', 'Adresa')}</Label>
            <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t('estimates.items', 'Stavke')}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('estimates.addItem', 'Dodaj')}
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                return (
                  <div key={idx} className="p-2 rounded border space-y-2">
                    <Input
                      placeholder={t('estimates.itemDescription', 'Opis')}
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
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
            <div className="flex justify-between"><span>{t('estimates.subtotal', 'Osnovica')}:</span><span>{subtotal.toFixed(2)} {currency.symbol}</span></div>
            <div className="flex justify-between"><span>{t('estimates.vat', 'PDV')}:</span><span>{vatAmount.toFixed(2)} {currency.symbol}</span></div>
            <div className="flex justify-between font-bold pt-1 border-t"><span>{t('estimates.total', 'Ukupno')}:</span><span>{total.toFixed(2)} {currency.symbol}</span></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('estimates.validUntil', 'Vrijedi do')}</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t('estimates.notes', 'Napomena')}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Odustani')}</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !clientName.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {estimate ? t('common.save', 'Spremi') : t('common.create', 'Kreiraj')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
