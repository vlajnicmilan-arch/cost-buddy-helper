import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Category, CATEGORIES, Expense, PaymentSource, PAYMENT_SOURCES, ReceiptItem, getCategoryInfo } from '@/types/expense';
import { Plus, Camera, Image, Loader2, X, ChevronDown, ChevronUp, Save, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface AddExpenseDialogProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[]) => Promise<void> | void;
}

interface ScannedData {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
  date: string | null;
  items: ReceiptItem[];
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
  const [saveReceipt, setSaveReceipt] = useState(true);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [showScannedPreview, setShowScannedPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { scanning, scanReceipt, uploadReceiptImage } = useReceiptScanner();

  const handleImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setReceiptImage(base64);
      
      const result = await scanReceipt(base64);
      
      if (result) {
        setScannedData({
          amount: result.amount,
          merchant: result.merchant,
          description: result.description,
          category: result.category,
          date: result.date,
          items: result.items
        });
        setShowScannedPreview(true);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const acceptScannedData = async () => {
    if (!scannedData || isSaving) return;
    
    setIsSaving(true);
    
    try {
      const validItems = scannedData.items.filter(item => item.name && item.total_price > 0);
      
      let receiptUrl: string | undefined;
      if (saveReceipt && receiptImage) {
        toast.info('Spremam sliku računa...');
        const uploadedUrl = await uploadReceiptImage(receiptImage);
        if (uploadedUrl) {
          receiptUrl = uploadedUrl;
        }
      }

      await onAdd({
        amount: scannedData.amount,
        description: scannedData.description,
        category: scannedData.category,
        date: new Date(scannedData.date || expenseDate),
        type: 'expense',
        payment_source: paymentSource,
        merchant_name: scannedData.merchant || undefined,
        receipt_url: receiptUrl,
        ai_extracted: true
      }, validItems.length > 0 ? validItems : undefined);

      resetForm();
      setOpen(false);
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Greška pri spremanju troška');
    } finally {
      setIsSaving(false);
    }
  };

  const rejectScannedData = () => {
    setScannedData(null);
    setShowScannedPreview(false);
    setReceiptImage(null);
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, total_price: 0 }]);
    setShowItems(true);
  };

  const updateItem = (index: number, field: keyof ReceiptItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unit_price') {
      const qty = field === 'quantity' ? Number(value) : newItems[index].quantity;
      const price = field === 'unit_price' ? Number(value) : (newItems[index].unit_price || 0);
      if (qty && price) {
        newItems[index].total_price = qty * price;
      }
    }
    
    setItems(newItems);
    
    const itemsTotal = newItems.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
    if (itemsTotal > 0) {
      setAmount(itemsTotal.toFixed(2));
    }
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
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
    setReceiptImage(null);
    setSaveReceipt(true);
    setScannedData(null);
    setShowScannedPreview(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const validItems = items.filter(item => item.name && item.total_price > 0);
    
    let receiptUrl: string | undefined;
    if (saveReceipt && receiptImage) {
      toast.info('Spremam sliku računa...');
      const uploadedUrl = await uploadReceiptImage(receiptImage);
      if (uploadedUrl) {
        receiptUrl = uploadedUrl;
        toast.success('Slika računa spremljena!');
      }
    }

    onAdd({
      amount: parseFloat(amount),
      description,
      category,
      date: new Date(expenseDate),
      type,
      payment_source: paymentSource,
      merchant_name: merchantName || undefined,
      receipt_url: receiptUrl,
      ai_extracted: scannedData !== null
    }, validItems.length > 0 ? validItems : undefined);

    resetForm();
    setOpen(false);
  };

  const categoryInfo = scannedData ? getCategoryInfo(scannedData.category) : null;

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
      <DialogContent className="sm:max-w-md glass-card border-border/50 h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-xl font-semibold">Nova transakcija</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {/* Scanned Data Preview */}
          {showScannedPreview && scannedData && (
            <div className="space-y-4 pb-4">
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Pronađeni podaci s računa
                  </h3>
                </div>
                
                {receiptImage && (
                  <div className="relative rounded-lg overflow-hidden h-20">
                    <img 
                      src={receiptImage} 
                      alt="Račun" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Iznos:</span>
                    <p className="font-bold text-lg">€{scannedData.amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trgovina:</span>
                    <p className="font-medium">{scannedData.merchant || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Datum:</span>
                    <p className="font-medium">
                      {scannedData.date 
                        ? new Date(scannedData.date).toLocaleDateString('hr-HR')
                        : 'Nije pronađen'
                      }
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kategorija:</span>
                    <p className="font-medium">
                      {categoryInfo?.icon} {categoryInfo?.name}
                    </p>
                  </div>
                </div>
                
                <div>
                  <span className="text-muted-foreground text-sm">Opis:</span>
                  <p className="font-medium text-sm">{scannedData.description}</p>
                </div>
                
                {scannedData.items.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">
                      Artikli ({scannedData.items.length}):
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

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="save-receipt-preview" 
                    checked={saveReceipt}
                    onCheckedChange={(checked) => setSaveReceipt(checked as boolean)}
                  />
                  <label 
                    htmlFor="save-receipt-preview" 
                    className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    Spremi sliku računa
                  </label>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2 rounded-xl"
                  onClick={rejectScannedData}
                >
                  <RotateCcw className="w-4 h-4" />
                  Odbaci
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-2 rounded-xl bg-primary"
                  onClick={acceptScannedData}
                >
                  <Check className="w-4 h-4" />
                  Prihvati i spremi
                </Button>
              </div>
            </div>
          )}

          {/* Main Form - Show when not previewing scanned data */}
          {!showScannedPreview && (
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
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Analiziram račun...
                </div>
              )}

              {/* Receipt Image Preview (after acceptance) */}
              {receiptImage && !scanning && scannedData && (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-muted/50 p-2">
                    <img 
                      src={receiptImage} 
                      alt="Račun" 
                      className="w-full h-20 object-cover rounded-lg"
                    />
                    <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded">
                      AI skeniran
                    </div>
                  </div>
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

              {/* Payment Source */}
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
                    <Label className="text-sm font-medium">
                      Artikli na računu
                      {items.length > 0 && (
                        <span className="ml-2 text-xs text-primary font-bold">
                          ({items.length})
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addItem}
                        className="h-8 text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Dodaj
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
                        Skeniraj račun ili dodaj artikle ručno
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

              {/* Save Receipt Option */}
              {receiptImage && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="save-receipt" 
                    checked={saveReceipt}
                    onCheckedChange={(checked) => setSaveReceipt(checked as boolean)}
                  />
                  <label 
                    htmlFor="save-receipt" 
                    className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    Spremi sliku računa
                  </label>
                </div>
              )}
            </form>
          )}
        </div>
        
        {/* Fixed Submit Button at bottom - outside ScrollArea */}
        {!showScannedPreview && (
          <div className="flex-shrink-0 pt-4 border-t border-border/50">
            <Button 
              type="button"
              onClick={handleSubmit}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              disabled={scanning || !amount || !description}
            >
              Spremi transakciju
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
