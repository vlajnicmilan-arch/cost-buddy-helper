import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Package, Loader2, Trash2, ArrowDown, ArrowUp, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  min_quantity: number;
  current_quantity: number;
}

interface Movement {
  id: string;
  type: string;
  quantity: number;
  price: number;
  note: string | null;
  created_at: string;
}

type View = 'list' | 'new_item' | 'detail' | 'movement';

export const InventoryPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [saving, setSaving] = useState(false);

  // New item form
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemUnit, setItemUnit] = useState('kom');
  const [itemPurchasePrice, setItemPurchasePrice] = useState('');
  const [itemSellingPrice, setItemSellingPrice] = useState('');
  const [itemMinQty, setItemMinQty] = useState('');
  const [itemCurrentQty, setItemCurrentQty] = useState('0');

  // Detail / movement
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementType, setMovementType] = useState<'in' | 'out'>('in');
  const [movementQty, setMovementQty] = useState('');
  const [movementPrice, setMovementPrice] = useState('');
  const [movementNote, setMovementNote] = useState('');

  useEffect(() => {
    if (activeBusinessProfileId && user) loadItems();
  }, [activeBusinessProfileId, user]);

  const loadItems = async () => {
    if (!activeBusinessProfileId) return;
    setLoading(true);
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('business_profile_id', activeBusinessProfileId)
      .order('name') as any;
    setItems(data || []);
    setLoading(false);
  };

  const saveItem = async () => {
    if (!user || !activeBusinessProfileId || !itemName.trim()) {
      toast.error('Unesite naziv artikla');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('inventory_items').insert({
      business_profile_id: activeBusinessProfileId,
      user_id: user.id,
      name: itemName.trim(),
      sku: itemSku.trim() || null,
      category: itemCategory.trim() || null,
      unit: itemUnit || 'kom',
      purchase_price: Number(itemPurchasePrice) || 0,
      selling_price: Number(itemSellingPrice) || 0,
      min_quantity: Number(itemMinQty) || 0,
      current_quantity: Number(itemCurrentQty) || 0,
    } as any);
    setSaving(false);
    if (error) { toast.error('Greška'); return; }
    toast.success('Artikl dodan');
    resetItemForm();
    loadItems();
    setView('list');
  };

  const resetItemForm = () => {
    setItemName(''); setItemSku(''); setItemCategory(''); setItemUnit('kom');
    setItemPurchasePrice(''); setItemSellingPrice(''); setItemMinQty(''); setItemCurrentQty('0');
  };

  const deleteItem = async (id: string) => {
    await supabase.from('inventory_items').delete().eq('id', id) as any;
    toast.success('Artikl obrisan');
    setSelectedItem(null);
    setView('list');
    loadItems();
  };

  const openDetail = async (item: InventoryItem) => {
    setSelectedItem(item);
    setView('detail');
    const { data } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(20) as any;
    setMovements(data || []);
  };

  const saveMovement = async () => {
    if (!selectedItem || !movementQty || Number(movementQty) <= 0) {
      toast.error('Unesite količinu');
      return;
    }
    setSaving(true);
    const qty = Number(movementQty);

    // Insert movement
    await supabase.from('inventory_movements').insert({
      item_id: selectedItem.id,
      type: movementType,
      quantity: qty,
      price: Number(movementPrice) || 0,
      note: movementNote.trim() || null,
    } as any);

    // Update current_quantity
    const newQty = movementType === 'in' 
      ? selectedItem.current_quantity + qty 
      : Math.max(0, selectedItem.current_quantity - qty);

    await supabase.from('inventory_items')
      .update({ current_quantity: newQty } as any)
      .eq('id', selectedItem.id);

    toast.success(movementType === 'in' ? 'Ulaz zabilježen' : 'Izlaz zabilježen');
    setSaving(false);
    setMovementQty(''); setMovementPrice(''); setMovementNote('');
    setView('detail');
    
    // Refresh
    loadItems();
    const updated = { ...selectedItem, current_quantity: newQty };
    setSelectedItem(updated);
    const { data } = await supabase.from('inventory_movements').select('*').eq('item_id', selectedItem.id).order('created_at', { ascending: false }).limit(20) as any;
    setMovements(data || []);
  };

  const lowStockItems = items.filter(i => i.min_quantity > 0 && i.current_quantity <= i.min_quantity);
  const totalValue = items.reduce((s, i) => s + i.current_quantity * i.purchase_price, 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  // Movement form
  if (view === 'movement' && selectedItem) return (
    <div>
      <button onClick={() => setView('detail')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <h2 className="text-base font-bold mb-3">{movementType === 'in' ? 'Ulaz robe' : 'Izlaz robe'}: {selectedItem.name}</h2>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Količina ({selectedItem.unit}) *</Label>
          <Input type="number" value={movementQty} onChange={e => setMovementQty(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Cijena po jedinici (€)</Label>
          <Input type="number" step="0.01" value={movementPrice} onChange={e => setMovementPrice(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Napomena</Label>
          <Input value={movementNote} onChange={e => setMovementNote(e.target.value)} placeholder="npr. Dobavljač XY" />
        </div>
        <p className="text-xs text-muted-foreground">
          Trenutno stanje: <span className="font-medium">{selectedItem.current_quantity} {selectedItem.unit}</span>
          {movementQty && (
            <> → <span className="font-bold">
              {movementType === 'in' 
                ? selectedItem.current_quantity + Number(movementQty)
                : Math.max(0, selectedItem.current_quantity - Number(movementQty))
              } {selectedItem.unit}
            </span></>
          )}
        </p>
        <Button className="w-full" onClick={saveMovement} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {movementType === 'in' ? 'Zabilježi ulaz' : 'Zabilježi izlaz'}
        </Button>
      </div>
    </div>
  );

  // Detail view
  if (view === 'detail' && selectedItem) return (
    <div>
      <button onClick={() => { setView('list'); setSelectedItem(null); }} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold">{selectedItem.name}</h2>
          <p className="text-xs text-muted-foreground">{selectedItem.sku || 'Bez šifre'} · {selectedItem.category || 'Bez kategorije'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Stanje</p>
            <p className={`text-sm font-bold ${selectedItem.current_quantity <= selectedItem.min_quantity && selectedItem.min_quantity > 0 ? 'text-expense' : ''}`}>
              {selectedItem.current_quantity} {selectedItem.unit}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Nabavna</p>
            <p className="text-sm font-bold">{formatAmount(selectedItem.purchase_price)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-[10px] text-muted-foreground">Prodajna</p>
            <p className="text-sm font-bold">{formatAmount(selectedItem.selling_price)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 mb-4">
        <Button size="sm" className="flex-1 gap-1 text-xs" onClick={() => { setMovementType('in'); setView('movement'); }}>
          <ArrowDown className="w-3.5 h-3.5" /> Ulaz
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => { setMovementType('out'); setView('movement'); }}>
          <ArrowUp className="w-3.5 h-3.5" /> Izlaz
        </Button>
        <Button size="sm" variant="destructive" className="gap-1 text-xs" onClick={() => deleteItem(selectedItem.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {movements.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Posljednji prometi</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-1">
            {movements.map(m => (
              <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                <div className="flex items-center gap-1.5">
                  {m.type === 'in' ? <ArrowDown className="w-3 h-3 text-income" /> : <ArrowUp className="w-3 h-3 text-expense" />}
                  <span>{m.quantity} {selectedItem.unit}</span>
                  {m.note && <span className="text-muted-foreground">· {m.note}</span>}
                </div>
                {m.price > 0 && <span className="text-muted-foreground">{formatAmount(m.price)}/{selectedItem.unit}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // New item form
  if (view === 'new_item') return (
    <div>
      <button onClick={() => setView('list')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <h2 className="text-base font-bold mb-3">Novi artikl</h2>
      <div className="space-y-3">
        <div className="space-y-2"><Label className="text-xs">Naziv *</Label><Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="npr. Cement 25kg" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2"><Label className="text-xs">Šifra (SKU)</Label><Input value={itemSku} onChange={e => setItemSku(e.target.value)} /></div>
          <div className="space-y-2"><Label className="text-xs">Kategorija</Label><Input value={itemCategory} onChange={e => setItemCategory(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-2"><Label className="text-xs">Jedinica</Label><Input value={itemUnit} onChange={e => setItemUnit(e.target.value)} placeholder="kom" /></div>
          <div className="space-y-2"><Label className="text-xs">Nabavna €</Label><Input type="number" step="0.01" value={itemPurchasePrice} onChange={e => setItemPurchasePrice(e.target.value)} /></div>
          <div className="space-y-2"><Label className="text-xs">Prodajna €</Label><Input type="number" step="0.01" value={itemSellingPrice} onChange={e => setItemSellingPrice(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2"><Label className="text-xs">Min. količina</Label><Input type="number" value={itemMinQty} onChange={e => setItemMinQty(e.target.value)} placeholder="0" /></div>
          <div className="space-y-2"><Label className="text-xs">Početno stanje</Label><Input type="number" value={itemCurrentQty} onChange={e => setItemCurrentQty(e.target.value)} /></div>
        </div>
        <Button className="w-full" onClick={saveItem} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Spremi artikl
        </Button>
      </div>
    </div>
  );

  // Main list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2">📦 Zalihe</h2>
        <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => { resetItemForm(); setView('new_item'); }}>
          <Plus className="w-3.5 h-3.5" /> Novi artikl
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-none shadow-sm">
          <CardContent className="p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Ukupna vrijednost</p>
            <p className="text-sm font-bold">{formatAmount(totalValue)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">Artikala</p>
            <p className="text-sm font-bold">{items.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-none shadow-sm bg-expense/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-expense" />
              <p className="text-xs font-medium text-expense">Niske zalihe ({lowStockItems.length})</p>
            </div>
            <div className="space-y-0.5">
              {lowStockItems.slice(0, 3).map(i => (
                <p key={i.id} className="text-[10px] text-muted-foreground">
                  {i.name}: <span className="font-medium text-expense">{i.current_quantity}</span> / {i.min_quantity} {i.unit}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center">
            <Package className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema artikala</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Dodajte prvi artikl za praćenje zaliha</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(item)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.sku || ''}{item.sku && item.category ? ' · ' : ''}{item.category || ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${item.min_quantity > 0 && item.current_quantity <= item.min_quantity ? 'text-expense' : ''}`}>
                    {item.current_quantity} {item.unit}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatAmount(item.purchase_price)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
