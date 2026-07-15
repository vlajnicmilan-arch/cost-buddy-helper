import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { parseMoneySigned } from '@/lib/money';
import { showError } from '@/hooks/useStatusFeedback';
import { DecisionAttachmentPicker } from './DecisionAttachmentPicker';
import { useDecisionScan } from '@/contexts/DecisionScanContext';

interface NewDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    title: string;
    initial_description: string;
    price?: number | null;
    attachments?: File[];
  }) => Promise<{ ok: boolean }>;
}

const DRAFT_KEY = 'new-decision';

export function NewDecisionDialog({ open, onOpenChange, onSubmit }: NewDecisionDialogProps) {
  const { t } = useTranslation();
  const { getDraft, saveTextDraft, saveAttachments, clearDraft } = useDecisionScan();

  // Rehidracija drafta (preživljava remount uzrokovan Android kamera roundtripom).
  const initial = getDraft(DRAFT_KEY);
  const [title, setTitle] = useState(initial.text.title ?? '');
  const [description, setDescription] = useState(initial.text.description ?? '');
  const [priceRaw, setPriceRaw] = useState(initial.text.priceRaw ?? '');
  const [attachments, setAttachments] = useState<File[]>(initial.attachments ?? []);
  const [submitting, setSubmitting] = useState(false);

  // Kad se dijalog otvara, ponovo pročitaj draft iz contexta (za slučaj da je
  // međuvremenu ažuriran, npr. iz capture flow-a).
  useEffect(() => {
    if (!open) return;
    const d = getDraft(DRAFT_KEY);
    setTitle(d.text.title ?? '');
    setDescription(d.text.description ?? '');
    setPriceRaw(d.text.priceRaw ?? '');
    setAttachments(d.attachments ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Perzistiraj tekst na promjenu.
  useEffect(() => { saveTextDraft(DRAFT_KEY, { title, description, priceRaw }); }, [title, description, priceRaw, saveTextDraft]);
  // Perzistiraj File priloge (u memoriji contexta).
  useEffect(() => { saveAttachments(DRAFT_KEY, attachments); }, [attachments, saveAttachments]);

  const reset = () => {
    setTitle(''); setDescription(''); setPriceRaw(''); setAttachments([]); setSubmitting(false);
    clearDraft(DRAFT_KEY);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    let price: number | null = null;
    if (priceRaw.trim() !== '') {
      const parsed = parseMoneySigned(priceRaw);
      if (!parsed.valid) {
        showError(t('projects.decisions.priceInvalid', 'Neispravan iznos cijene'));
        return;
      }
      if (parsed.value === 0) {
        showError(t('projects.decisions.priceNonZero', 'Cijena ne smije biti nula — ostavi prazno ili unesi iznos'));
        return;
      }
      price = parsed.value;
    }
    setSubmitting(true);
    const res = await onSubmit({ title, initial_description: description, price, attachments });
    setSubmitting(false);
    if (res.ok) {
      reset();
      onOpenChange(false);
    }
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-2">
            <Label htmlFor="decision-price">
              {t('projects.decisions.field.price', 'Cijena (€) — opcionalno')}
            </Label>
            <Input
              id="decision-price"
              inputMode="decimal"
              value={priceRaw}
              onChange={(e) => setPriceRaw(e.target.value)}
              placeholder={t('projects.decisions.field.pricePlaceholder', 'npr. 2400 ili −5000 za smanjenje') as string}
            />
            <p className="text-[11px] text-muted-foreground">
              {t('projects.decisions.field.priceHint', 'Ako prihvaćeno, automatski se stvara aneks ugovora. Negativan iznos umanjuje ugovor. Nula nije dozvoljena.')}
            </p>
          </div>
          <DecisionAttachmentPicker
            value={attachments}
            onChange={setAttachments}
            disabled={submitting}
            captureKey={DRAFT_KEY}
          />
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
