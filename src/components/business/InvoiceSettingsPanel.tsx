import { useState, useEffect } from 'react';
import { FileText, Save, Loader2, Upload, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FormData {
  vat_obligation_type: string;
  vat_exemption_note: string;
  owner_name: string;
  invoice_payment_days: number;
  invoice_header: string;
  invoice_footer: string;
  logo_url: string;
}

const defaultExemptionNote = 'Obveznik nije u sustavu PDV-a, PDV nije obračunat temeljem čl. 90 st.1 Zakona o PDV-u.';

export const InvoiceSettingsPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [form, setForm] = useState<FormData>({
    vat_obligation_type: 'non_vat',
    vat_exemption_note: defaultExemptionNote,
    owner_name: '',
    invoice_payment_days: 7,
    invoice_header: '',
    invoice_footer: '',
    logo_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    supabase
      .from('business_profiles')
      .select('vat_obligation_type, vat_exemption_note, owner_name, invoice_payment_days, invoice_header, invoice_footer, logo_url')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setForm({
            vat_obligation_type: d.vat_obligation_type || 'non_vat',
            vat_exemption_note: d.vat_exemption_note || defaultExemptionNote,
            owner_name: d.owner_name || '',
            invoice_payment_days: d.invoice_payment_days ?? 7,
            invoice_header: d.invoice_header || '',
            invoice_footer: d.invoice_footer || '',
            logo_url: d.logo_url || '',
          });
        }
        setLoading(false);
      });
  }, [activeBusinessProfileId, user]);

  const handleSave = async () => {
    if (!activeBusinessProfileId) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_profiles')
      .update({
        vat_obligation_type: form.vat_obligation_type,
        vat_exemption_note: form.vat_exemption_note || null,
        owner_name: form.owner_name || null,
        invoice_payment_days: form.invoice_payment_days,
        invoice_header: form.invoice_header || null,
        invoice_footer: form.invoice_footer || null,
        logo_url: form.logo_url || null,
      })
      .eq('id', activeBusinessProfileId);

    setSaving(false);
    if (error) toast.error('Greška pri spremanju');
    else toast.success('Postavke računa spremljene');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeBusinessProfileId) return;
    
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Dozvoljeni formati: PNG, JPG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maksimalna veličina: 2MB');
      return;
    }

    setUploadingLogo(true);
    const filePath = `${user.id}/${activeBusinessProfileId}/logo.${file.type.split('/')[1]}`;
    
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Greška pri uploadu');
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);
    setForm(f => ({ ...f, logo_url: urlData.publicUrl }));
    setUploadingLogo(false);
    toast.success('Logo učitan');
  };

  const update = (key: keyof FormData, value: string | number) => setForm(f => ({ ...f, [key]: value }));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">Postavke računa</h2>
            <p className="text-[10px] text-muted-foreground">PDV, format ispisa, logo</p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Spremi
        </Button>
      </div>

      {/* PDV Obligation */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Obveza PDV-a</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <RadioGroup value={form.vat_obligation_type} onValueChange={v => update('vat_obligation_type', v)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="R1" id="r1" />
              <Label htmlFor="r1" className="text-sm cursor-pointer">Izdanom računu (R1)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="R2" id="r2" />
              <Label htmlFor="r2" className="text-sm cursor-pointer">Naplaćenoj naknadi (R2)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="non_vat" id="non_vat" />
              <Label htmlFor="non_vat" className="text-sm cursor-pointer">Neobveznik PDV-a</Label>
            </div>
          </RadioGroup>

          {form.vat_obligation_type === 'non_vat' && (
            <div>
              <Label className="text-xs font-medium">PDV oslobođenje <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.vat_exemption_note}
                onChange={e => update('vat_exemption_note', e.target.value)}
                className="text-sm mt-1 min-h-[60px]"
                placeholder="Tekst napomene o oslobođenju PDV-a..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner & payment */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transakcijski račun</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <div>
            <Label className="text-xs">Vlasnik obrta (samo za obrte)</Label>
            <Input
              value={form.owner_name}
              onChange={e => update('owner_name', e.target.value)}
              placeholder="vl. Ime Prezime"
              className="h-8 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Dani odgode plaćanja</Label>
            <Input
              type="number"
              value={form.invoice_payment_days}
              onChange={e => update('invoice_payment_days', parseInt(e.target.value) || 0)}
              className="h-8 text-sm mt-1 w-24"
              min={0}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Logo</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <p className="text-[10px] text-muted-foreground mb-2">Učitajte logo tvrtke za ispis na računima</p>
          {form.logo_url ? (
            <div className="flex items-center gap-3">
              <img src={form.logo_url} alt="Logo" className="h-12 w-auto rounded border object-contain" />
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={() => update('logo_url', '')}>
                <Trash2 className="w-3 h-3" /> Ukloni
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
              {uploadingLogo ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground/50 mb-1" />
                  <span className="text-xs text-muted-foreground">PNG, JPG (max 2MB)</span>
                </>
              )}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Header & Footer */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zaglavlja i podnožja</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <p className="text-[10px] text-muted-foreground">Dodatni tekst za ispis na svakom zaglavlju i podnožju</p>
          <div>
            <Label className="text-xs">Zaglavlje</Label>
            <Textarea
              value={form.invoice_header}
              onChange={e => update('invoice_header', e.target.value)}
              className="text-sm mt-1 min-h-[60px]"
              placeholder="GSM: 095 ...\ne-mail: ..."
            />
          </div>
          <div>
            <Label className="text-xs">Podnožje</Label>
            <Textarea
              value={form.invoice_footer}
              onChange={e => update('invoice_footer', e.target.value)}
              className="text-sm mt-1 min-h-[60px]"
              placeholder="Hvala na povjerenju!"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
