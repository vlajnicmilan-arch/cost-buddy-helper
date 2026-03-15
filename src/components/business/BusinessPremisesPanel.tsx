import { useState, useEffect } from 'react';
import { MapPin, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Premise {
  id: string;
  name: string;
  label: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  is_active: boolean;
}

export const BusinessPremisesPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [premises, setPremises] = useState<Premise[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Premise | null>(null);
  const [form, setForm] = useState({ name: '', label: '', address: '', city: '', postal_code: '', country: 'Hrvatska' });
  const [saving, setSaving] = useState(false);

  const fetchPremises = async () => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    const { data } = await supabase
      .from('business_premises')
      .select('*')
      .eq('business_profile_id', activeBusinessProfileId)
      .order('sort_order');
    setPremises((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPremises(); }, [activeBusinessProfileId, user]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: String(premises.length + 1), label: '', address: '', city: '', postal_code: '', country: 'Hrvatska' });
    setDialogOpen(true);
  };

  const openEdit = (p: Premise) => {
    setEditing(p);
    setForm({ name: p.name, label: p.label || '', address: p.address || '', city: p.city || '', postal_code: p.postal_code || '', country: p.country || 'Hrvatska' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !activeBusinessProfileId || !user) return;
    setSaving(true);
    const payload = {
      business_profile_id: activeBusinessProfileId,
      user_id: user.id,
      name: form.name.trim(),
      label: form.label.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      country: form.country.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('business_premises').update(payload).eq('id', editing.id);
      if (error) toast.error('Greška pri ažuriranju');
      else toast.success('Poslovni prostor ažuriran');
    } else {
      const { error } = await supabase.from('business_premises').insert(payload);
      if (error) toast.error('Greška pri dodavanju');
      else toast.success('Poslovni prostor dodan');
    }
    setSaving(false);
    setDialogOpen(false);
    fetchPremises();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('business_premises').delete().eq('id', id);
    if (error) toast.error('Nije moguće obrisati (postoje povezane blagajne?)');
    else { toast.success('Obrisano'); fetchPremises(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Poslovni prostori</h2>
            <p className="text-[10px] text-muted-foreground">Oznake za fiskalizaciju računa</p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={openNew}>
          <Plus className="w-3 h-3" /> Dodaj
        </Button>
      </div>

      {premises.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <MapPin className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema poslovnih prostora</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Dodajte poslovni prostor za ispravan format broja računa</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {premises.map(p => (
            <Card key={p.id} className="border-none shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{p.name}</p>
                    {p.label && <span className="text-xs text-muted-foreground">{p.label}</span>}
                    {p.is_active ? (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-income/30 text-income"><Check className="w-2.5 h-2.5" /></Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-destructive/30 text-destructive"><X className="w-2.5 h-2.5" /></Badge>
                    )}
                  </div>
                  {(p.address || p.city) && (
                    <p className="text-[10px] text-muted-foreground">{[p.address, p.city].filter(Boolean).join(', ')}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
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
            <DialogTitle className="text-sm">{editing ? 'Uredi' : 'Novi'} poslovni prostor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Oznaka *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="1" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Naziv</Label>
                <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Glavni ured" className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Adresa</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Poštanski broj</Label>
                <Input value={form.postal_code} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Grad</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <Button className="w-full h-9 text-sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Spremi' : 'Dodaj'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
