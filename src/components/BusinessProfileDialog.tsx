import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Building2, Save, Loader2, Sparkles, Plus, ArrowLeft, Trash2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

interface BusinessProfile {
  id?: string;
  company_name: string;
  oib: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  iban: string;
  bank_name: string;
  email: string;
  phone: string;
  website: string;
  is_vat_payer: boolean;
  vat_id: string;
  activity_code: string;
  activity_description: string;
  mbs: string;
  court_registry: string;
  legal_form: string;
  is_active: boolean;
}

const emptyProfile: BusinessProfile = {
  company_name: '',
  oib: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'Hrvatska',
  iban: '',
  bank_name: '',
  email: '',
  phone: '',
  website: '',
  is_vat_payer: false,
  vat_id: '',
  activity_code: '',
  activity_description: '',
  mbs: '',
  court_registry: '',
  legal_form: '',
  is_active: false,
};

interface BusinessProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'list' | 'edit';

export const BusinessProfileDialog = ({ open, onOpenChange }: BusinessProfileDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [profile, setProfile] = useState<BusinessProfile>(emptyProfile);
  const [view, setView] = useState<View>('list');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadProfiles();
      setView('list');
    }
  }, [open, user]);

  const loadProfiles = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setProfiles(
        (data || []).map(d => ({
          id: d.id,
          company_name: d.company_name || '',
          oib: d.oib || '',
          address: d.address || '',
          city: d.city || '',
          postal_code: d.postal_code || '',
          country: d.country || 'Hrvatska',
          iban: d.iban || '',
          bank_name: d.bank_name || '',
          email: d.email || '',
          phone: d.phone || '',
          website: d.website || '',
          is_vat_payer: d.is_vat_payer || false,
          vat_id: d.vat_id || '',
          activity_code: d.activity_code || '',
          activity_description: d.activity_description || '',
          mbs: d.mbs || '',
          court_registry: d.court_registry || '',
          legal_form: d.legal_form || '',
          is_active: d.is_active ?? false,
        }))
      );
    } catch (error) {
      console.error('Error loading business profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActive = async (profileId: string) => {
    if (!user) return;
    try {
      // Deactivate all
      await supabase
        .from('business_profiles')
        .update({ is_active: false })
        .eq('user_id', user.id);

      // Activate selected
      await supabase
        .from('business_profiles')
        .update({ is_active: true })
        .eq('id', profileId);

      showSuccess(t('business.activated', 'Tvrtka postavljena kao aktivna'));
      loadProfiles();
    } catch (error) {
      console.error('Error setting active profile:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    }
  };

  const handleDelete = async (profileId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('business_profiles')
        .delete()
        .eq('id', profileId);

      if (error) throw error;
      showSuccess(t('business.deleted', 'Tvrtka obrisana'));
      loadProfiles();
    } catch (error) {
      console.error('Error deleting profile:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    }
  };

  const handleEdit = (p: BusinessProfile) => {
    setProfile(p);
    setView('edit');
  };

  const handleNew = () => {
    setProfile({ ...emptyProfile, is_active: profiles.length === 0 });
    setView('edit');
  };

  const handleAILookup = async () => {
    const query = profile.company_name.trim();
    if (!query || query.length < 2) {
      showError(t('business.aiLookupHint', 'Unesite naziv tvrtke za pretragu'));
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-company', {
        body: { query },
      });

      if (error) throw error;
      if (data?.error) {
        showError(data.error);
        return;
      }
      if (!data?.found) {
        showError(t('business.notFound', 'Tvrtka nije pronađena'));
        return;
      }

      setProfile(prev => ({
        ...prev,
        company_name: prev.company_name || data.company_name || '',
        oib: prev.oib || data.oib || '',
        address: prev.address || data.address || '',
        city: prev.city || data.city || '',
        postal_code: prev.postal_code || data.postal_code || '',
        country: prev.country || data.country || 'Hrvatska',
        iban: prev.iban || data.iban || '',
        bank_name: prev.bank_name || data.bank_name || '',
        email: prev.email || data.email || '',
        phone: prev.phone || data.phone || '',
        website: prev.website || data.website || '',
        is_vat_payer: data.is_vat_payer ?? prev.is_vat_payer,
        vat_id: prev.vat_id || (data.is_vat_payer ? `HR${data.oib || prev.oib}` : '') || '',
        activity_code: prev.activity_code || data.activity_code || '',
        activity_description: prev.activity_description || data.activity_description || '',
        mbs: prev.mbs || data.mbs || '',
        court_registry: prev.court_registry || data.court_registry || '',
        legal_form: prev.legal_form || data.legal_form || '',
      }));
      const sourceLabel = data.source === 'sudreg' ? 'sudskog registra' : 'AI baze';
      showSuccess(t('business.aiFilledSuccess', `Podaci popunjeni iz ${sourceLabel}`).replace('{{source}}', sourceLabel));
    } catch (error) {
      console.error('AI lookup error:', error);
      showError(t('business.aiLookupError', 'Greška pri AI pretraživanju'));
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!profile.company_name.trim()) {
      showError(t('business.nameRequired', 'Naziv tvrtke je obavezan'));
      return;
    }

    setSaving(true);
    try {
      const isNew = !profile.id;
      const shouldBeActive = isNew && profiles.length === 0;

      // If this will be active, deactivate others first
      if (shouldBeActive || profile.is_active) {
        await supabase
          .from('business_profiles')
          .update({ is_active: false })
          .eq('user_id', user.id);
      }

      const profileData = {
        user_id: user.id,
        company_name: profile.company_name.trim(),
        oib: profile.oib.trim() || null,
        address: profile.address.trim() || null,
        city: profile.city.trim() || null,
        postal_code: profile.postal_code.trim() || null,
        country: profile.country.trim() || null,
        iban: profile.iban.trim() || null,
        bank_name: profile.bank_name.trim() || null,
        email: profile.email.trim() || null,
        phone: profile.phone.trim() || null,
        website: profile.website.trim() || null,
        is_vat_payer: profile.is_vat_payer,
        vat_id: profile.vat_id.trim() || null,
        activity_code: profile.activity_code.trim() || null,
        activity_description: profile.activity_description.trim() || null,
        mbs: profile.mbs.trim() || null,
        court_registry: profile.court_registry.trim() || null,
        legal_form: profile.legal_form.trim() || null,
        is_active: shouldBeActive || profile.is_active,
        updated_at: new Date().toISOString(),
      };

      if (profile.id) {
        const { error } = await supabase
          .from('business_profiles')
          .update(profileData)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('business_profiles')
          .insert(profileData);
        if (error) throw error;
      }

      showSuccess(t('business.saved', 'Poslovni profil spremljen'));
      setView('list');
      loadProfiles();
    } catch (error) {
      console.error('Error saving business profile:', error);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BusinessProfile, value: string | boolean) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const renderList = () => (
    <div className="space-y-4">
      {profiles.length === 0 && !loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('business.noProfiles', 'Nemate dodanih tvrtki')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map(p => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-muted/50 ${
                p.is_active ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onClick={() => handleEdit(p)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{p.company_name}</p>
                  {p.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                      {t('business.active', 'Aktivna')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[p.oib, p.city, p.legal_form].filter(Boolean).join(' · ') || t('business.noDetails', 'Bez detalja')}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!p.is_active && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={e => { e.stopPropagation(); handleSetActive(p.id!); }}
                    title={t('business.setActive', 'Postavi kao aktivnu')}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                  onClick={e => { e.stopPropagation(); handleDelete(p.id!); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full gap-2" onClick={handleNew}>
        <Plus className="w-4 h-4" />
        {t('business.addCompany', 'Dodaj tvrtku')}
      </Button>
    </div>
  );

  const renderForm = () => (
    <ScrollArea className="max-h-[60vh] pr-4">
      <div className="space-y-6 pb-4">
        {/* Basic Info */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('business.basicInfo', 'Osnovni podaci')}
          </h3>
          <div className="space-y-2">
            <Label>{t('business.companyName', 'Naziv tvrtke')} *</Label>
            <Input value={profile.company_name} onChange={e => updateField('company_name', e.target.value)} placeholder="Moja tvrtka d.o.o." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t('business.oib', 'OIB')}</Label>
              <Input value={profile.oib} onChange={e => updateField('oib', e.target.value)} placeholder="12345678901" maxLength={11} />
            </div>
            <div className="space-y-2">
              <Label>{t('business.legalForm', 'Pravni oblik')}</Label>
              <Input value={profile.legal_form} onChange={e => updateField('legal_form', e.target.value)} placeholder="d.o.o." />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={handleAILookup}
            disabled={aiLoading || (!profile.company_name.trim() && !profile.oib.trim())}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? t('business.aiSearching', 'AI pretražuje...') : t('business.aiAutoFill', 'AI automatsko popunjavanje')}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {t('business.aiAutoFillHint', 'Unesite naziv ili OIB, zatim kliknite za automatsko popunjavanje')}
          </p>
        </div>

        <Separator />

        {/* Address */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('business.addressSection', 'Adresa')}</h3>
          <div className="space-y-2">
            <Label>{t('business.address', 'Ulica i kućni broj')}</Label>
            <Input value={profile.address} onChange={e => updateField('address', e.target.value)} placeholder="Ilica 1" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label>{t('business.postalCode', 'Poštanski broj')}</Label>
              <Input value={profile.postal_code} onChange={e => updateField('postal_code', e.target.value)} placeholder="10000" />
            </div>
            <div className="space-y-2">
              <Label>{t('business.city', 'Grad')}</Label>
              <Input value={profile.city} onChange={e => updateField('city', e.target.value)} placeholder="Zagreb" />
            </div>
            <div className="space-y-2">
              <Label>{t('business.country', 'Država')}</Label>
              <Input value={profile.country} onChange={e => updateField('country', e.target.value)} placeholder="Hrvatska" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Contact */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('business.contact', 'Kontakt')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t('business.email', 'Email')}</Label>
              <Input type="email" value={profile.email} onChange={e => updateField('email', e.target.value)} placeholder="info@tvrtka.hr" />
            </div>
            <div className="space-y-2">
              <Label>{t('business.phone', 'Telefon')}</Label>
              <Input value={profile.phone} onChange={e => updateField('phone', e.target.value)} placeholder="+385 1 234 5678" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('business.website', 'Web stranica')}</Label>
            <Input value={profile.website} onChange={e => updateField('website', e.target.value)} placeholder="https://www.tvrtka.hr" />
          </div>
        </div>

        <Separator />

        {/* Banking */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('business.banking', 'Bankovni podaci')}</h3>
          <div className="space-y-2">
            <Label>{t('business.iban', 'IBAN')}</Label>
            <Input value={profile.iban} onChange={e => updateField('iban', e.target.value)} placeholder="HR1234567890123456789" />
          </div>
          <div className="space-y-2">
            <Label>{t('business.bankName', 'Banka')}</Label>
            <Input value={profile.bank_name} onChange={e => updateField('bank_name', e.target.value)} placeholder={t('placeholders.bankName')} />
          </div>
        </div>

        <Separator />

        {/* Tax & Registry */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('business.taxRegistry', 'Porez i registar')}</h3>
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <div>
              <Label htmlFor="vat-payer" className="text-sm font-medium cursor-pointer">{t('business.vatPayer', 'PDV obveznik')}</Label>
              <p className="text-xs text-muted-foreground">{t('business.vatPayerDesc', 'Tvrtka je u sustavu PDV-a')}</p>
            </div>
            <Switch id="vat-payer" checked={profile.is_vat_payer} onCheckedChange={checked => updateField('is_vat_payer', checked)} />
          </div>
          {profile.is_vat_payer && (
            <div className="space-y-2">
              <Label>{t('business.vatId', 'PDV ID')}</Label>
              <Input value={profile.vat_id} onChange={e => updateField('vat_id', e.target.value)} placeholder="HR12345678901" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>{t('business.activityCode', 'Šifra djelatnosti')}</Label>
              <Input value={profile.activity_code} onChange={e => updateField('activity_code', e.target.value)} placeholder="62.01" />
            </div>
            <div className="space-y-2">
              <Label>{t('business.mbs', 'MBS')}</Label>
              <Input value={profile.mbs} onChange={e => updateField('mbs', e.target.value)} placeholder="080123456" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('business.activityDesc', 'Opis djelatnosti')}</Label>
            <Input value={profile.activity_description} onChange={e => updateField('activity_description', e.target.value)} placeholder={t('placeholders.activityCode')} />
          </div>
          <div className="space-y-2">
            <Label>{t('business.courtRegistry', 'Trgovački sud')}</Label>
            <Input value={profile.court_registry} onChange={e => updateField('court_registry', e.target.value)} placeholder={t('placeholders.courtRegistry')} />
          </div>
        </div>
      </div>
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === 'edit' && (
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setView('list')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <Building2 className="w-5 h-5 text-primary" />
            {view === 'list'
              ? t('business.companies', 'Tvrtke')
              : profile.id
                ? t('business.editCompany', 'Uredi tvrtku')
                : t('business.newCompany', 'Nova tvrtka')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : view === 'list' ? (
          renderList()
        ) : (
          <>
            {renderForm()}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setView('list')}>
                {t('common.cancel', 'Odustani')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {t('common.save', 'Spremi')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
