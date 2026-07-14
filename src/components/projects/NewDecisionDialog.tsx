import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface NewDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { title: string; initial_description: string }) => Promise<{ ok: boolean }>;
}

export function NewDecisionDialog({ open, onOpenChange, onSubmit }: NewDecisionDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setTitle(''); setDescription(''); setSubmitting(false); };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    const res = await onSubmit({ title, initial_description: description });
    setSubmitting(false);
    if (res.ok) {
      reset();
      onOpenChange(false);
    }
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects.decisions.newDialog.title', 'Novi prijedlog odluke')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="decision-title">{t('projects.decisions.field.title', 'Naslov')} *</Label>
            <Input
              id="decision-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('projects.decisions.field.titlePlaceholder', 'Kratki naslov odluke') as string}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decision-desc">{t('projects.decisions.field.description', 'Opis prijedloga')} *</Label>
            <Textarea
              id="decision-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('projects.decisions.field.descriptionPlaceholder', 'Detaljno opišite prijedlog...') as string}
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('projects.decisions.newDialog.submit', 'Pošalji prijedlog')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
