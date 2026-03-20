import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Car, MapPin, Calendar, Loader2, Trash2, ChevronRight, FileText } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface TravelOrder {
  id: string;
  business_profile_id: string;
  user_id: string;
  date_from: string;
  date_to: string;
  destination: string;
  purpose: string | null;
  vehicle: string;
  km_start: number;
  km_end: number;
  km_rate: number;
  daily_allowance_type: string;
  status: string;
  created_at: string;
}

interface TravelExpense {
  id: string;
  travel_order_id: string;
  expense_type: string;
  amount: number;
  description: string | null;
}

const VEHICLES = [
  { value: 'personal_car', label: 'Osobni automobil' },
  { value: 'company_car', label: 'Službeni automobil' },
  { value: 'public_transport', label: 'Javni prijevoz' },
  { value: 'other', label: 'Ostalo' },
];

const ALLOWANCE_TYPES = [
  { value: 'none', label: 'Bez dnevnice' },
  { value: 'half', label: 'Pola dnevnice (8-12h)' },
  { value: 'full', label: 'Cijela dnevnica (12h+)' },
];

const EXPENSE_TYPES = [
  { value: 'toll', label: 'Cestarina' },
  { value: 'parking', label: 'Parking' },
  { value: 'accommodation', label: 'Smještaj' },
  { value: 'fuel', label: 'Gorivo' },
  { value: 'other', label: 'Ostalo' },
];

const FULL_DAILY_ALLOWANCE = 26.55; // HR domestic rate

export const TravelOrdersPanel = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [orders, setOrders] = useState<TravelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<TravelOrder | null>(null);
  const [detailExpenses, setDetailExpenses] = useState<TravelExpense[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [vehicle, setVehicle] = useState('personal_car');
  const [kmStart, setKmStart] = useState('');
  const [kmEnd, setKmEnd] = useState('');
  const [kmRate, setKmRate] = useState('0.40');
  const [allowanceType, setAllowanceType] = useState('none');
  const [extraExpenses, setExtraExpenses] = useState<{ type: string; amount: string; description: string }[]>([]);

  useEffect(() => {
    if (activeBusinessProfileId && user) loadOrders();
  }, [activeBusinessProfileId, user]);

  const loadOrders = async () => {
    if (!activeBusinessProfileId) return;
    setLoading(true);
    const { data } = await supabase
      .from('travel_orders')
      .select('*')
      .eq('business_profile_id', activeBusinessProfileId)
      .order('date_from', { ascending: false }) as any;
    setOrders(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setDateFrom(new Date().toISOString().split('T')[0]);
    setDateTo(new Date().toISOString().split('T')[0]);
    setDestination('');
    setPurpose('');
    setVehicle('personal_car');
    setKmStart('');
    setKmEnd('');
    setKmRate('0.40');
    setAllowanceType('none');
    setExtraExpenses([]);
  };

  const handleSave = async () => {
    if (!user || !activeBusinessProfileId || !destination.trim()) {
      toast.error(t('toasts.enterDestination'));
      return;
    }
    setSaving(true);

    const { data: order, error } = await supabase
      .from('travel_orders')
      .insert({
        business_profile_id: activeBusinessProfileId,
        user_id: user.id,
        date_from: dateFrom,
        date_to: dateTo,
        destination: destination.trim(),
        purpose: purpose.trim() || null,
        vehicle,
        km_start: Number(kmStart) || 0,
        km_end: Number(kmEnd) || 0,
        km_rate: Number(kmRate) || 0.40,
        daily_allowance_type: allowanceType,
        status: 'draft',
      } as any)
      .select()
      .single() as any;

    if (error) {
      toast.error(t('toasts.profileSaveError'));
      setSaving(false);
      return;
    }

    // Save extra expenses
    const validExpenses = extraExpenses.filter(e => e.type && Number(e.amount) > 0);
    if (validExpenses.length > 0 && order) {
      await supabase.from('travel_order_expenses').insert(
        validExpenses.map(e => ({
          travel_order_id: order.id,
          expense_type: e.type,
          amount: Number(e.amount),
          description: e.description || null,
        })) as any
      );
    }

    toast.success(t('toasts.travelOrderSaved'));
    resetForm();
    setDialogOpen(false);
    setSaving(false);
    loadOrders();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('travel_orders').delete().eq('id', id) as any;
    toast.success(t('toasts.travelOrderDeleted'));
    setDetailOrder(null);
    loadOrders();
  };

  const openDetail = async (order: TravelOrder) => {
    setDetailOrder(order);
    const { data } = await supabase
      .from('travel_order_expenses')
      .select('*')
      .eq('travel_order_id', order.id) as any;
    setDetailExpenses(data || []);
  };

  const calcKm = (order: TravelOrder) => Math.max(0, order.km_end - order.km_start);
  const calcKmCost = (order: TravelOrder) => calcKm(order) * order.km_rate;
  const calcAllowance = (order: TravelOrder) => {
    const days = differenceInDays(new Date(order.date_to), new Date(order.date_from)) + 1;
    if (order.daily_allowance_type === 'full') return days * FULL_DAILY_ALLOWANCE;
    if (order.daily_allowance_type === 'half') return days * (FULL_DAILY_ALLOWANCE / 2);
    return 0;
  };

  const addExpenseRow = () => {
    setExtraExpenses(prev => [...prev, { type: 'toll', amount: '', description: '' }]);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2">🚗 Putni troškovi</h2>
        <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> Novi nalog
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center">
            <Car className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema putnih naloga</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Dodajte prvi putni nalog</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const km = calcKm(order);
            const total = calcKmCost(order) + calcAllowance(order);
            return (
              <Card key={order.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(order)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{order.destination}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(order.date_from), 'dd.MM.yyyy')}
                      {order.date_from !== order.date_to && ` — ${format(new Date(order.date_to), 'dd.MM.yyyy')}`}
                      {km > 0 && ` · ${km} km`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{formatAmount(total)}</p>
                    <Badge variant="outline" className="text-[8px] px-1 py-0">
                      {order.status === 'draft' ? 'Nacrt' : order.status === 'approved' ? 'Odobreno' : order.status}
                    </Badge>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Travel Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-base">Novi putni nalog</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4 pb-4">
              <div className="space-y-2">
                <Label className="text-xs">Odredište *</Label>
                <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="npr. Split" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Svrha putovanja</Label>
                <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Poslovni sastanak..." className="min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">Datum od</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Datum do</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prijevozno sredstvo</Label>
                <Select value={vehicle} onValueChange={setVehicle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VEHICLES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {(vehicle === 'personal_car' || vehicle === 'company_car') && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Km početak</Label>
                      <Input type="number" value={kmStart} onChange={e => setKmStart(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Km kraj</Label>
                      <Input type="number" value={kmEnd} onChange={e => setKmEnd(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Naknada po km (€)</Label>
                    <Input type="number" step="0.01" value={kmRate} onChange={e => setKmRate(e.target.value)} />
                  </div>
                  {Number(kmEnd) > Number(kmStart) && (
                    <div className="p-2 rounded-lg bg-muted/30 text-xs">
                      <span className="text-muted-foreground">Kilometraža: </span>
                      <span className="font-medium">{Number(kmEnd) - Number(kmStart)} km × {kmRate} €/km = {formatAmount((Number(kmEnd) - Number(kmStart)) * Number(kmRate))}</span>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Dnevnica</Label>
                <Select value={allowanceType} onValueChange={setAllowanceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOWANCE_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {allowanceType !== 'none' && (
                  <p className="text-[10px] text-muted-foreground">
                    Dnevnica: {formatAmount(allowanceType === 'full' ? FULL_DAILY_ALLOWANCE : FULL_DAILY_ALLOWANCE / 2)} / dan
                  </p>
                )}
              </div>

              {/* Extra Expenses */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Ostali troškovi</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addExpenseRow}>
                    <Plus className="w-3 h-3" /> Dodaj
                  </Button>
                </div>
                {extraExpenses.map((exp, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_24px] gap-1.5 items-end">
                    <Select value={exp.type} onValueChange={v => {
                      const updated = [...extraExpenses];
                      updated[i].type = v;
                      setExtraExpenses(updated);
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="€"
                      className="h-8 text-xs"
                      value={exp.amount}
                      onChange={e => {
                        const updated = [...extraExpenses];
                        updated[i].amount = e.target.value;
                        setExtraExpenses(updated);
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-6 text-destructive" onClick={() => {
                      setExtraExpenses(prev => prev.filter((_, j) => j !== i));
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Spremi putni nalog
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {detailOrder?.destination}
            </DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Datum:</span>
                  <p className="font-medium">
                    {format(new Date(detailOrder.date_from), 'dd.MM.yyyy')}
                    {detailOrder.date_from !== detailOrder.date_to && ` — ${format(new Date(detailOrder.date_to), 'dd.MM.yyyy')}`}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Prijevoz:</span>
                  <p className="font-medium">{VEHICLES.find(v => v.value === detailOrder.vehicle)?.label}</p>
                </div>
              </div>

              {detailOrder.purpose && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Svrha:</span>
                  <p className="font-medium">{detailOrder.purpose}</p>
                </div>
              )}

              {/* Cost breakdown */}
              <Card className="border-none shadow-sm">
                <CardContent className="p-3 space-y-1.5">
                  {calcKm(detailOrder) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Kilometraža ({calcKm(detailOrder)} km × {detailOrder.km_rate} €)</span>
                      <span className="font-medium">{formatAmount(calcKmCost(detailOrder))}</span>
                    </div>
                  )}
                  {calcAllowance(detailOrder) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Dnevnica</span>
                      <span className="font-medium">{formatAmount(calcAllowance(detailOrder))}</span>
                    </div>
                  )}
                  {detailExpenses.map(exp => (
                    <div key={exp.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{EXPENSE_TYPES.find(t => t.value === exp.expense_type)?.label || exp.expense_type}</span>
                      <span className="font-medium">{formatAmount(exp.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-border/30">
                    <span>Ukupno</span>
                    <span>{formatAmount(
                      calcKmCost(detailOrder) + calcAllowance(detailOrder) + detailExpenses.reduce((s, e) => s + e.amount, 0)
                    )}</span>
                  </div>
                </CardContent>
              </Card>

              <Button variant="destructive" size="sm" className="w-full gap-1 text-xs" onClick={() => handleDelete(detailOrder.id)}>
                <Trash2 className="w-3 h-3" /> Obriši nalog
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
