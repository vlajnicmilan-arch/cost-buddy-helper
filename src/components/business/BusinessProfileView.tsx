import { useState, useEffect } from 'react';
import { Building2, Save, Loader2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const ProfileField = ({ label, value, field, editing, formValue, onUpdate }: { 
  label: string; 
  value: string | null | undefined; 
  field: string;
  editing: boolean;
  formValue: string;
  onUpdate: (field: string, value: string) => void;
}) => (
  <div>
    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
    {editing ? (
      <Input
        value={formValue}
        onChange={e => onUpdate(field, e.target.value)}
        className="h-8 text-sm mt-0.5"
      />
    ) : (
      <p className="text-sm font-medium mt-0.5">{value || <span className="text-muted-foreground/50 italic">—</span>}</p>
    )}
  </div>
);

interface ProfileData {
  id: string;
  company_name: string;
  oib: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  iban: string | null;
  bank_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  is_vat_payer: boolean | null;
  vat_id: string | null;
  activity_code: string | null;
  activity_description: string | null;
  mbs: string | null;
  court_registry: string | null;
  legal_form: string | null;
  is_active: boolean;
}

export const BusinessProfileView = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ProfileData>>({});

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    supabase
      .from('business_profiles')
      .select('*')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setProfile(data as ProfileData);
          setForm(data as ProfileData);
        }
        setLoading(false);
      });
  }, [activeBusinessProfileId, user]);

  const handleSave = async () => {
    if (!profile?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_profiles')
      .update({
        company_name: form.company_name,
        oib: form.oib || null,
        address: form.address || null,
        city: form.city || null,
        postal_code: form.postal_code || null,
        country: form.country || null,
        iban: form.iban || null,
        bank_name: form.bank_name || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        is_vat_payer: form.is_vat_payer || false,
        vat_id: form.vat_id || null,
        activity_code: form.activity_code || null,
        activity_description: form.activity_description || null,
        mbs: form.mbs || null,
        court_registry: form.court_registry || null,
        legal_form: form.legal_form || null,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (error) {
      toast.error(t('toasts.profileSaveError'));
    } else {
      toast.success(t('toasts.profileUpdated'));
      setProfile({ ...profile, ...form } as ProfileData);
      setEditing(false);
    }
  };

  const updateField = (key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Profil tvrtke nije pronađen</p>
      </div>
    );
  }

  const F = (label: string, value: string | null | undefined, field: string) => (
    <ProfileField label={label} value={value} field={field} editing={editing} formValue={(form as any)[field] || ''} onUpdate={updateField} />
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">{profile.company_name}</h2>
            <div className="flex items-center gap-1.5">
              {profile.legal_form && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{profile.legal_form}</Badge>}
              {profile.is_vat_payer && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-income/30 text-income">PDV obveznik</Badge>}
            </div>
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="w-3 h-3" />
            Uredi
          </Button>
        ) : (
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Spremi
          </Button>
        )}
      </div>

      {/* Basic Info */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Osnovni podaci</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2.5">
          {F("Naziv tvrtke", profile.company_name, "company_name")}
          {F("OIB", profile.oib, "oib")}
          {F("MBS", profile.mbs, "mbs")}
          {F("Pravni oblik", profile.legal_form, "legal_form")}
          {F("Trgovački sud", profile.court_registry, "court_registry")}
          {editing && (
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">PDV obveznik</Label>
              <Switch checked={!!form.is_vat_payer} onCheckedChange={v => updateField('is_vat_payer', v)} />
            </div>
          )}
          {(editing || profile.is_vat_payer) && F("PDV ID (VAT)", profile.vat_id, "vat_id")}
        </CardContent>
      </Card>

      {/* Activity */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Djelatnost</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2.5">
          {F("Šifra djelatnosti", profile.activity_code, "activity_code")}
          {F("Opis djelatnosti", profile.activity_description, "activity_description")}
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adresa</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2.5">
          {F("Adresa", profile.address, "address")}
          <div className="grid grid-cols-2 gap-2">
            {F("Poštanski broj", profile.postal_code, "postal_code")}
            {F("Grad", profile.city, "city")}
          </div>
          {F("Država", profile.country, "country")}
        </CardContent>
      </Card>

      {/* Bank */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bankovni podaci</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2.5">
          {F("IBAN", profile.iban, "iban")}
          {F("Banka", profile.bank_name, "bank_name")}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kontakt</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2.5">
          {F("Email", profile.email, "email")}
          {F("Telefon", profile.phone, "phone")}
          {F("Web stranica", profile.website, "website")}
        </CardContent>
      </Card>

      {editing && (
        <Button variant="outline" className="w-full text-xs" onClick={() => { setEditing(false); setForm(profile); }}>
          Odustani
        </Button>
      )}
    </div>
  );
};
