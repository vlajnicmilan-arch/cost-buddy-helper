import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Category, CATEGORIES, Expense, PaymentSource, PAYMENT_SOURCES, ReceiptItem } from '@/types/expense';
import { Plus, Camera, Image, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AddExpenseDialogProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[]) => void;
}

export const AddExpenseDialog = ({ onAdd }: AddExpenseDialogProps) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [merchantName, setMerchantName] = useState('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('cash');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [showItems, setShowItems] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { scanning, scanReceipt } = useReceiptScanner();

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const result = await scanReceipt(base64);
      
      if (result) {
        setAmount(result.amount.toString());
        setDescription(result.description);
        setCategory(result.category);
        setMerchantName(result.merchant);
        // If scanner returns items in the future, we can add them here
      }
    };
    reader.readAsDataURL(file);
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, total_price: 0 }]);
    setShowItems(true);
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate total if quantity and unit_price are set
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? Number(value) : newItems[index].quantity;
      const price = field === 'unit_price' ? Number(value) : (newItems[index].unit_price || 0);
      if (qty && price) {
        newItems[index].total_price = qty * price;
      }
    }
    
    setItems(newItems);
    
    // Auto-calculate total amount from items
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) {
      setAmount(itemsTotal.toFixed(2));
    }
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
    // Recalculate total
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) {
      setAmount(itemsTotal.toFixed(2));
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setCategory('food');
    setMerchantName('');
    setPaymentSource('cash');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setItems([]);
    setShowItems(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const validItems = items.filter(item => item.name && item.total_price > 0);

    onAdd({
      amount: parseFloat(amount),
      description,
      category,
      date: new Date(expenseDate),
      type,
      payment_source: paymentSource,
      merchant_name: merchantName || undefined,
      ai_extracted: false
    }, validItems.length > 0 ? validItems : undefined);

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
          <Plus className="w-5 h-5" />
          Dodaj
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md glass-card border-border/50 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Nova transakcija</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 -mx-6 px-6">
          <form onSubmit={handleSubmit} className="space-y-5 pb-4">
            {/* Receipt Scan Buttons */}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageCapture}
                className="hidden"
                id="camera-input"
              />
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute('capture', 'environment');
                    fileInputRef.current.click();
                  }
                }}
                disabled={scanning}
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Fotografiraj
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 rounded-xl"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                  }
                }}
                disabled={scanning}
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                Iz galerije
              </Button>
            </div>

            {scanning && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Analiziram račun...
              </div>
            )}

            {/* Type Toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-xl">
              <button
                type="button"
                onClick={() => setType('expense')}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                  type === 'expense' 
                    ? "bg-expense text-expense-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Trošak
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                  type === 'income' 
                    ? "bg-income text-income-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Prihod
              </button>
            </div>

            {/* Payment Source - Show for both types */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {type === 'income' ? 'Izvor prihoda' : 'Način plaćanja'}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setPaymentSource(source.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all",
                      paymentSource === source.id 
                        ? type === 'income' 
                          ? "border-income bg-income/10" 
                          : "border-expense bg-expense/10"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <span className="text-lg">{source.icon}</span>
                    <span className="text-xs font-medium text-muted-foreground">{source.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-medium">Datum</Label>
              <Input
                id="date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>

            {/* Merchant Name */}
            <div className="space-y-2">
              <Label htmlFor="merchant" className="text-sm font-medium">
                {type === 'income' ? 'Izvor' : 'Trgovina / Naziv'}
              </Label>
              <Input
                id="merchant"
                placeholder={type === 'income' ? 'Npr. Plaća, Freelance...' : 'Npr. Konzum, Lidl...'}
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>

            {/* Items Section - Only for expenses */}
            {type === 'expense' && (
              <Collapsible open={showItems} onOpenChange={setShowItems}>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Artikli na računu</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addItem}
                      className="h-8 text-xs gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Dodaj artikl
                    </Button>
                    {items.length > 0 && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                </div>
                
                <CollapsibleContent className="mt-2 space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start p-3 bg-muted/50 rounded-xl">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Naziv artikla"
                          value={item.name}
                          onChange={(e) => updateItem(index, 'name', e.target.value)}
                          className="h-9 text-sm rounded-lg"
                        />
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="Kol."
                            value={item.quantity || ''}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                            className="h-9 w-16 text-sm rounded-lg"
                            min="1"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Cijena"
                            value={item.unit_price || ''}
                            onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-9 flex-1 text-sm rounded-lg"
                          />
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Ukupno"
                            value={item.total_price || ''}
                            onChange={(e) => updateItem(index, 'total_price', parseFloat(e.target.value) || 0)}
                            className="h-9 w-24 text-sm rounded-lg font-medium"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Dodaj artikle za detaljniji pregled troškova
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium">
                Ukupni iznos (€)
                {items.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (izračunato iz artikala)
                  </span>
                )}
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg font-mono rounded-xl"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">Opis</Label>
              <Input
                id="description"
                placeholder={type === 'income' ? 'Npr. Plaća za siječanj' : 'Npr. Tjedna kupovina'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-12 rounded-xl"
                required
              />
            </div>

            {/* Category - Only show for expenses */}
            {type === 'expense' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Kategorija</Label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                        category === cat.id 
                          ? "border-primary bg-primary/5" 
                          : "border-transparent bg-muted/50 hover:bg-muted"
                      )}
                    >
                      <span className="text-xl">{cat.icon}</span>
                      <span className="text-xs font-medium text-muted-foreground">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Submit */}
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              disabled={scanning}
            >
              Spremi transakciju
            </Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
