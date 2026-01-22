import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, Category, PaymentSource, CATEGORIES, PAYMENT_SOURCES } from '@/types/expense';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface EditTransactionDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (expense: Expense) => Promise<void>;
}

export const EditTransactionDialog = ({ expense, open, onOpenChange, onSave }: EditTransactionDialogProps) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [date, setDate] = useState<Date>(new Date());
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [saving, setSaving] = useState(false);

  // Initialize form when expense changes
  useState(() => {
    if (expense) {
      setAmount(expense.amount.toString());
      setDescription(expense.description);
      setCategory(expense.category);
      setPaymentSource(expense.payment_source || 'cash');
      setDate(expense.date);
      setType(expense.type);
    }
  });

  // Reset form when dialog opens with new expense
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && expense) {
      setAmount(expense.amount.toString());
      setDescription(expense.description);
      setCategory(expense.category);
      setPaymentSource(expense.payment_source || 'cash');
      setDate(expense.date);
      setType(expense.type);
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!expense) return;
    
    setSaving(true);
    try {
      await onSave({
        ...expense,
        amount: parseFloat(amount),
        description,
        category,
        payment_source: paymentSource,
        date,
        type,
        updated_at: new Date().toISOString()
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi {type === 'income' ? 'prihod' : 'trošak'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Type Toggle */}
          <div className="space-y-2">
            <Label>Vrsta</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === 'expense' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('expense')}
              >
                Trošak
              </Button>
              <Button
                type="button"
                variant={type === 'income' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setType('income')}
              >
                Prihod
              </Button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Iznos (€)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opis transakcije"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Kategorija</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Source */}
          <div className="space-y-2">
            <Label>Izvor plaćanja</Label>
            <Select value={paymentSource} onValueChange={(v) => setPaymentSource(v as PaymentSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_SOURCES.map((src) => (
                  <SelectItem key={src.id} value={src.id}>
                    <span className="flex items-center gap-2">
                      <span>{src.icon}</span>
                      <span>{src.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>Datum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: hr }) : "Odaberi datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  locale={hr}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Odustani
          </Button>
          <Button onClick={handleSave} disabled={saving || !amount || !description}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Spremi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};