import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, User, Clock, Banknote, Loader2, Users, CalendarDays, List } from 'lucide-react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, format, subMonths, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { startOfMonth, endOfMonth, format, subMonths, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  work_hours: number;
  hourly_rate: number;
  work_start_time?: string | null;
  work_end_time?: string | null;
  actualHoursTotal: number;
  actualCostTotal: number;
}

interface WorkEntry {
  id: string;
  worker_id: string;
  work_date: string;
  scheduled_hours: number;
  actual_hours: number;
  note?: string | null;
}

export const BusinessWorkforcePanel = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState('list');

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [workHours, setWorkHours] = useState('8');
  const [hourlyRate, setHourlyRate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');

  // Work entry state
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryDate, setEntryDate] = useState('');
  const [entryHours, setEntryHours] = useState('');
  const [entryNote, setEntryNote] = useState('');

  const fetchWorkers = useCallback(async () => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    try {
      const [wRes, eRes] = await Promise.all([
        supabase
          .from('project_workers')
          .select('*')
          .eq('business_profile_id', activeBusinessProfileId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_work_entries')
          .select('worker_id, actual_hours')
          .eq('business_profile_id', activeBusinessProfileId)
      ]);
      if (wRes.error) throw wRes.error;

      const hoursByWorker: Record<string, number> = {};
      (eRes.data || []).forEach(e => {
        hoursByWorker[e.worker_id] = (hoursByWorker[e.worker_id] || 0) + Number(e.actual_hours);
      });

      setWorkers((wRes.data || []).map(w => {
        const hrs = hoursByWorker[w.id] || 0;
        return {
          ...w,
          work_hours: Number(w.work_hours),
          hourly_rate: Number(w.hourly_rate),
          actualHoursTotal: hrs,
          actualCostTotal: hrs * Number(w.hourly_rate),
        };
      }));
    } catch (err) {
      console.error(err);
      toast.error(t('workforce.loadError'));
    } finally {
      setLoading(false);
    }
  }, [activeBusinessProfileId, user]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);

  const resetForm = () => {
    setFirstName(''); setLastName(''); setPosition('');
    setWorkHours('8'); setHourlyRate('');
    setStartTime('08:00'); setEndTime('16:00');
  };

  const openAdd = () => { resetForm(); setEditingWorker(null); setDialogOpen(true); };
  const openEdit = (w: Worker) => {
    setEditingWorker(w);
    setFirstName(w.first_name); setLastName(w.last_name); setPosition(w.position);
    setWorkHours(w.work_hours.toString()); setHourlyRate(w.hourly_rate.toString());
    setStartTime(w.work_start_time?.slice(0, 5) || '08:00');
    setEndTime(w.work_end_time?.slice(0, 5) || '16:00');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !position.trim() || !activeBusinessProfileId) return;

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      position: position.trim(),
      work_hours: parseFloat(workHours) || 8,
      hourly_rate: parseFloat(hourlyRate) || 0,
      work_start_time: startTime,
      work_end_time: endTime,
      business_profile_id: activeBusinessProfileId,
    };

    try {
      if (editingWorker) {
        const { error } = await supabase.from('project_workers').update(payload).eq('id', editingWorker.id);
        if (error) throw error;
        toast.success(t('workforce.workerUpdated'));
      } else {
        const { error } = await supabase.from('project_workers').insert({ ...payload, project_id: null } as any);
        if (error) throw error;
        toast.success(t('workforce.workerAdded'));
      }
      setDialogOpen(false);
      fetchWorkers();
    } catch (err) {
      console.error(err);
      toast.error(t('workforce.saveError'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('project_workers').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Radnik uklonjen');
      setDeleteId(null);
      fetchWorkers();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri brisanju');
    }
  };

  // Fetch work entries for selected worker & month
  const fetchEntries = useCallback(async () => {
    if (!selectedWorker || !activeBusinessProfileId) return;
    const ms = startOfMonth(selectedMonth);
    const me = endOfMonth(selectedMonth);
    const { data, error } = await supabase
      .from('project_work_entries')
      .select('*')
      .eq('worker_id', selectedWorker.id)
      .eq('business_profile_id', activeBusinessProfileId)
      .gte('work_date', format(ms, 'yyyy-MM-dd'))
      .lte('work_date', format(me, 'yyyy-MM-dd'))
      .order('work_date');
    if (!error) setEntries((data || []).map(e => ({ ...e, scheduled_hours: Number(e.scheduled_hours), actual_hours: Number(e.actual_hours) })));
  }, [selectedWorker, selectedMonth, activeBusinessProfileId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !entryDate || !activeBusinessProfileId) return;
    try {
      const hrs = parseFloat(entryHours) || selectedWorker.work_hours;
      const { error } = await supabase.from('project_work_entries').insert({
        worker_id: selectedWorker.id,
        business_profile_id: activeBusinessProfileId,
        project_id: null,
        work_date: entryDate,
        scheduled_hours: selectedWorker.work_hours,
        actual_hours: hrs,
        note: entryNote || null,
      } as any);
      if (error) throw error;
      toast.success('Unos dodan');
      setEntryDialogOpen(false);
      setEntryDate(''); setEntryHours(''); setEntryNote('');
      fetchEntries();
      fetchWorkers();
    } catch (err) {
      console.error(err);
      toast.error('Greška pri unosu');
    }
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from('project_work_entries').delete().eq('id', id);
    if (!error) { fetchEntries(); fetchWorkers(); toast.success('Unos uklonjen'); }
  };

  const totalCost = workers.reduce((s, w) => s + w.actualCostTotal, 0);
  const totalHours = workers.reduce((s, w) => s + w.actualHoursTotal, 0);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  // Worker detail view (hours calendar)
  if (selectedWorker) {
    const days = eachDayOfInterval({ start: startOfMonth(selectedMonth), end: endOfMonth(selectedMonth) });
    const monthTotal = entries.reduce((s, e) => s + e.actual_hours, 0);
    const monthCost = monthTotal * selectedWorker.hourly_rate;

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedWorker(null)} className="text-xs text-primary flex items-center gap-1">← Natrag na popis</button>
        
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{selectedWorker.first_name} {selectedWorker.last_name}</h3>
            <p className="text-xs text-muted-foreground">{selectedWorker.position}</p>
          </div>
          <Button size="sm" onClick={() => { setEntryDate(format(new Date(), 'yyyy-MM-dd')); setEntryHours(selectedWorker.work_hours.toString()); setEntryDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Unos sati
          </Button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>←</Button>
          <span className="text-sm font-medium">{format(selectedMonth, 'LLLL yyyy', { locale: hr })}</span>
          <Button variant="outline" size="sm" onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))}>→</Button>
        </div>

        {/* Summary */}
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Ukupno ovaj mjesec</p>
              <p className="text-sm font-medium">{monthTotal}h odrađeno</p>
            </div>
            <p className="text-lg font-bold text-primary">{formatAmount(monthCost)}</p>
          </CardContent>
        </Card>

        {/* Entries list */}
        <div className="space-y-2">
          {days.map(day => {
            const dayEntries = entries.filter(e => isSameDay(parseISO(e.work_date), day));
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            if (dayEntries.length === 0 && isWeekend) return null;
            return (
              <div key={day.toISOString()} className={`flex items-center justify-between p-2 rounded-lg text-sm ${dayEntries.length > 0 ? 'bg-primary/5' : isWeekend ? '' : 'bg-muted/30'}`}>
                <span className={`${isWeekend ? 'text-muted-foreground' : ''}`}>
                  {format(day, 'EEE dd.MM.', { locale: hr })}
                </span>
                {dayEntries.length > 0 ? (
                  <div className="flex items-center gap-2">
                    {dayEntries.map(e => (
                      <div key={e.id} className="flex items-center gap-1">
                        <Badge variant="secondary">{e.actual_hours}h</Badge>
                        {e.note && <span className="text-[10px] text-muted-foreground max-w-[80px] truncate">{e.note}</span>}
                        <button onClick={() => deleteEntry(e.id)} className="text-destructive/60 hover:text-destructive text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Add entry dialog */}
        <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Unos radnih sati</DialogTitle></DialogHeader>
            <form onSubmit={handleAddEntry} className="space-y-4">
              <div className="space-y-2">
                <Label>Datum</Label>
                <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Odrađeni sati</Label>
                <Input type="number" step="0.5" min="0" value={entryHours} onChange={e => setEntryHours(e.target.value)} placeholder={selectedWorker.work_hours.toString()} />
              </div>
              <div className="space-y-2">
                <Label>Napomena (opcionalno)</Label>
                <Input value={entryNote} onChange={e => setEntryNote(e.target.value)} placeholder="npr. Prekovremeni rad" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEntryDialogOpen(false)}>Odustani</Button>
                <Button type="submit">Spremi</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">Radnici & satnice</h3>
          <Badge variant="secondary">{workers.length}</Badge>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Dodaj
        </Button>
      </div>

      {/* Summary */}
      {workers.length > 0 && (
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Ukupni trošak rada</p>
              <p className="text-xs text-muted-foreground">{totalHours}h odrađeno</p>
            </div>
            <p className="text-lg font-bold text-primary">{formatAmount(totalCost)}</p>
          </CardContent>
        </Card>
      )}

      {/* Workers list */}
      {workers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Nema unesenih radnika</p>
          <p className="text-sm">Dodajte radnike za praćenje radnog vremena i troškova</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workers.map(w => (
            <Card key={w.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => { setSelectedWorker(w); setSelectedMonth(new Date()); }}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{w.first_name} {w.last_name}</h4>
                      <Badge variant="outline" className="text-[10px]">{w.position}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{w.work_start_time?.slice(0, 5) || '08:00'}-{w.work_end_time?.slice(0, 5) || '16:00'}</span>
                      <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />{formatAmount(w.hourly_rate)}/h</span>
                    </div>
                    <p className="text-xs mt-1 font-medium">
                      Odrađeno: {w.actualHoursTotal}h = <span className="text-primary">{formatAmount(w.actualCostTotal)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(w.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWorker ? 'Uredi radnika' : 'Dodaj radnika'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ime</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ime" required />
              </div>
              <div className="space-y-1.5">
                <Label>Prezime</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Prezime" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Radno mjesto</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="npr. Zidar, Programer..." required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Od</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Do</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Zadani sati/dan</Label>
                <Input type="number" step="0.5" min="0" value={workHours} onChange={e => setWorkHours(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cijena sata (€)</Label>
                <Input type="number" step="0.01" min="0" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Odustani</Button>
              <Button type="submit">{editingWorker ? 'Spremi' : 'Dodaj'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ukloni radnika?</AlertDialogTitle>
            <AlertDialogDescription>Svi zapisi o radnim satima ovog radnika bit će izbrisani.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Ukloni</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
