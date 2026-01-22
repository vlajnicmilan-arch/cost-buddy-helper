import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CustomPaymentSource, DEFAULT_PAYMENT_ICONS, DEFAULT_PAYMENT_COLORS } from '@/types/customPaymentSource';

interface PaymentSourceData {
  name: string;
  icon: string;
  color: string;
  balance: number;
  description?: string;
}

interface CustomPaymentSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: CustomPaymentSource | null;
  onSave: (data: PaymentSourceData) => Promise<void>;
  initialData?: Partial<PaymentSourceData>;
}

export const CustomPaymentSourceDialog = ({
  open,
  onOpenChange,
  source,
  onSave,
  initialData,
}: CustomPaymentSourceDialogProps) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💳');
  const [color, setColor] = useState('#6b7280');
  const [balance, setBalance] = useState('0');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (source) {
        setName(source.name);
        setIcon(source.icon);
        setColor(source.color);
        setBalance(source.balance?.toString() || '0');
        setDescription(source.description || '');
      } else if (initialData) {
        setName(initialData.name || '');
        setIcon(initialData.icon || '💳');
        setColor(initialData.color || '#6b7280');
        setBalance(initialData.balance?.toString() || '0');
        setDescription(initialData.description || '');
      } else {
        setName('');
        setIcon('💳');
        setColor('#6b7280');
        setBalance('0');
        setDescription('');
      }
    }
  }, [open, source, initialData]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ 
        name: name.trim(), 
        icon, 
        color, 
        balance: parseFloat(balance) || 0,
        description: description.trim() || undefined
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const formattedBalance = parseFloat(balance) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {source ? 'Uredi izvor plaćanja' : 'Novi izvor plaćanja'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Naziv</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="npr. PayPal, Google Pay..."
            />
          </div>

          {/* Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">Stanje računa (€)</Label>
            <Input
              id="balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Opis (opcionalno)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="npr. broj računa, bilješke..."
              rows={2}
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>Ikona</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PAYMENT_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                    icon === i
                      ? 'ring-2 ring-primary bg-primary/10 scale-110'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>Boja</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PAYMENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Pregled</Label>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: color }}
                >
                  <span>{icon}</span>
                </div>
                <div>
                  <span className="font-medium">{name || 'Naziv izvora'}</span>
                  {description && (
                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">{description}</p>
                  )}
                </div>
              </div>
              <span className={`font-mono font-semibold ${formattedBalance >= 0 ? 'text-income' : 'text-expense'}`}>
                €{formattedBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Odustani
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Spremanje...' : 'Spremi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
