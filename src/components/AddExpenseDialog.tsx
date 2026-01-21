import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Category, CATEGORIES, Expense } from '@/types/expense';
import { Plus, Camera, Image, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';

interface AddExpenseDialogProps {
  onAdd: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => void;
}

export const AddExpenseDialog = ({ onAdd }: AddExpenseDialogProps) => {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [merchantName, setMerchantName] = useState('');
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
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    onAdd({
      amount: parseFloat(amount),
      description,
      category,
      date: new Date(),
      type,
      merchant_name: merchantName || undefined,
      ai_extracted: false
    });

    setAmount('');
    setDescription('');
    setCategory('food');
    setMerchantName('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
          <Plus className="w-5 h-5" />
          Dodaj
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md glass-card border-border/50 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Nova transakcija</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
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

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">Iznos (€)</Label>
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

          {/* Merchant Name */}
          <div className="space-y-2">
            <Label htmlFor="merchant" className="text-sm font-medium">Trgovina (opcionalno)</Label>
            <Input
              id="merchant"
              placeholder="Npr. Konzum"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Opis</Label>
            <Input
              id="description"
              placeholder="Npr. Tjedna kupovina"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-12 rounded-xl"
              required
            />
          </div>

          {/* Category */}
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

          {/* Submit */}
          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            disabled={scanning}
          >
            Spremi transakciju
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
