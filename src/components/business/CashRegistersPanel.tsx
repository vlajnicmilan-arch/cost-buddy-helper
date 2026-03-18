import { useState, useEffect } from 'react';
import { Monitor, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CashRegister {
  id: string;
  name: string;
  label: string | null;
  device_type: string;
  premise_id: string;
  is_active: boolean;
  balance: number;
}

interface Premise {
  id: string;
  name: string;
  label: string | null;
}

const deviceTypeLabels: Record<string, string> = { mob: 'MOB', web: 'WEB', pos: 'POS', other: 'Ostalo' };

export const CashRegistersPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [premises, setPremises] = useState<Premise[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CashRegister | null>(null);
  const [form, setForm] = useState({ name: '', label: '', device_type: 'mob', premise_id: '', balance: '0' });
  const [saving, setSaving] = useState(false);
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState('');

  const fetchData = async () => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    const [regRes, premRes] = await Promise.all([
      supabase.from('cash_registers').select('*').eq('business_profile_id', activeBusinessProfileId).order('created_at'),
      supabase.from('business_premises').select('id, name, label').eq('business_profile_id', activeBusinessProfileId).order('sort_order'),
    ]);
    setRegisters((regRes.data as any[]) || []);
    setPremises((premRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeBusinessProfileId, user]);

  const openNew = () => {
    if (premises.length === 0) { toast.error('Prvo dodajte poslovni prostor'); return; }
    setEditing(null);
    setForm({ name: String(registers.length + 1), label: '', device_type: 'mob', premise_id: premises[0].id, balance: '0' });
    setDialogOpen(true);
  };

  const openEdit = (r: CashRegister) => {
    setEditing(r);
    setForm({ name: r.name, label: r.label || '', device_type: r.device_type, premise_id: r.premise_id, balance: String(r.balance || 0) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.premise_id || !activeBusinessProfileId || !user) return;
    setSaving(true);
    const payload = {
      business_profile_id: activeBusinessProfileId,
      premise_id: form.premise_id,
      user_id: user.id,
      name: form.name.trim(),
      label: form.label.trim() || null,
      device_type: form.device_type,
      balance: parseFloat(form.balance) || 0,
    };

    if (editing) {
      const { error } = await supabase.from('cash_registers').update(payload).eq('id', editing.id);
      if (error) toast.error('Greška pri ažuriranju');
      else toast.success('Blagajna ažurirana');
    } else {
      const { error } = await supabase.from('cash_registers').insert(payload);
      if (error) toast.error('Greška pri dodavanju');
      else toast.success('Blagajna dodana');
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleBalanceSave = async (id: string) => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    const { error } = await supabase.from('cash_registers').update({ balance: val }).eq('id', id);
    if (error) toast.error('Greška pri ažuriranju stanja');
    else { toast.success('Stanje ažurirano'); fetchData(); }
    setEditingBalance(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('cash_registers').delete().eq('id', id);
    if (error) toast.error('Greška pri brisanju');
    else { toast.success('Obrisano'); fetchData(); }
  };

  const getPremiseName = (pid: string) => {
    const p = premises.find(pr => pr.id === pid);
    return p ? `PP${p.name}` : '';
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Blagajne</h2>
            <p className="text-[10px] text-muted-foreground">Naplatni uređaji po poslovnim prostorima</p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={openNew}>
          <Plus className="w-3 h-3" /> Dodaj
        </Button>
      </div>

      {registers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Monitor className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema blagajni</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              {premises.length === 0 ? 'Prvo dodajte poslovni prostor' : 'Dodajte blagajnu za fiskalizaciju'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {registers.map(r => (
            <Card key={r.id} className="border-none shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{r.name}</p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{deviceTypeLabels[r.device_type] || r.device_type}</Badge>
                    {r.is_active ? (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-income/30 text-income"><Check className="w-2.5 h-2.5" /></Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-destructive/30 text-destructive"><X className="w-2.5 h-2.5" /></Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{getPremiseName(r.premise_id)}{r.label ? ` · ${r.label}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editing ? 'Uredi' : 'Nova'} blagajna</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Poslovni prostor *</Label>
              <Select value={form.premise_id} onValueChange={v => setForm(f => ({ ...f, premise_id: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {premises.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.label ? ` - ${p.label}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Oznaka *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="1" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Tip</Label>
                <Select value={form.device_type} onValueChange={v => setForm(f => ({ ...f, device_type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mob">MOB</SelectItem>
                    <SelectItem value="web">WEB</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="other">Ostalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Naziv</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Mobilna blagajna" className="h-8 text-sm" />
            </div>
            <Button className="w-full h-9 text-sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.premise_id}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Spremi' : 'Dodaj'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
