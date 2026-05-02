import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { Briefcase } from 'lucide-react';

interface QuickBusinessProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (profileId: string) => void;
}

const LEGAL_FORMS = ['d.o.o.', 'j.d.o.o.', 'obrt', 'paušalni obrt', 'udruga', 'ostalo'];

/**
 * Minimal "+ New company" dialog used inline from CustomPaymentSourceDialog.
 * Only company_name (required) + legal_form (optional). Full details
 * (OIB, address, IBAN, logo) can be filled later in Settings → Companies.
 */
export const QuickBusinessProfileDialog = ({
  open,
  onOpenChange,
  onCreated,
}: QuickBusinessProfileDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [legalForm, setLegalForm] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setLegalForm('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .insert({
          user_id: user.id,
          company_name: name.trim(),
          legal_form: legalForm || null,
          is_active: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      showSuccess(t('business.quickCreate.success', 'Tvrtka kreirana'));
      window.dispatchEvent(new Event('business-profiles-changed'));
      onCreated?.(data.id);
      onOpenChange(false);
    } catch (err) {
      console.error('[QuickBusinessProfileDialog] insert failed', err);
      showError(t('errors.generic', 'Došlo je do greške'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm z-[70]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-600" />
            {t('business.quickCreate.title', 'Nova tvrtka')}
          </DialogTitle>
          <DialogDescription>
            {t('business.quickCreate.hint', 'Detalje (OIB, adresa, IBAN, logo) možeš dodati kasnije u Postavkama → Tvrtke.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="quick-company-name">
              {t('business.companyName', 'Naziv tvrtke')} *
            </Label>
            <Input
              id="quick-company-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('business.quickCreate.namePlaceholder', 'npr. Mjugh d.o.o.')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && !saving) handleSave();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-legal-form">
              {t('business.quickCreate.legalForm', 'Pravni oblik')}{' '}
              <span className="text-xs text-muted-foreground">
                {t('business.quickCreate.legalFormOptional', '(opcionalno)')}
              </span>
            </Label>
            <Select value={legalForm} onValueChange={setLegalForm}>
              <SelectTrigger id="quick-legal-form">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                {LEGAL_FORMS.map((lf) => (
                  <SelectItem key={lf} value={lf}>{lf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('business.quickCreate.save', 'Spremi tvrtku')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
