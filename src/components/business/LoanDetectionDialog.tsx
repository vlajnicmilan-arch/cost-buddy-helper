import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpRight, ArrowDownRight, Sparkles, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { DetectedLoan } from '@/hooks/useLoanDetection';

interface LoanDetectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedLoans: DetectedLoan[];
  onConfirm: (loans: DetectedLoan[]) => void;
}

export const LoanDetectionDialog = ({ open, onOpenChange, detectedLoans, onConfirm }: LoanDetectionDialogProps) => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(detectedLoans.map((_, i) => i))
  );
  const [editedLoans, setEditedLoans] = useState<DetectedLoan[]>(detectedLoans);

  const toggleIndex = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateLoan = (idx: number, updates: Partial<DetectedLoan>) => {
    setEditedLoans(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  };

  const handleConfirm = () => {
    const selected = editedLoans.filter((_, i) => selectedIndices.has(i));
    onConfirm(selected);
    onOpenChange(false);
  };

  if (detectedLoans.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {t('business.debts.detectedLoans', 'Otkrivene pozajmice')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('business.debts.detectedLoansDesc', 'Pronađene su moguće pozajmice u transakcijama. Odaberite koje želite dodati u evidenciju dugovanja.')}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-3 pr-2">
            {editedLoans.map((loan, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 space-y-2 transition-opacity ${
                  selectedIndices.has(idx) ? 'border-primary/30 bg-primary/5' : 'opacity-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedIndices.has(idx)}
                    onCheckedChange={() => toggleIndex(idx)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{loan.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold">{formatAmount(loan.amount)}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {format(loan.date, 'dd.MM.yyyy')}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
                        {loan.source === 'keyword' ? <Search className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                        {loan.confidence === 'high' ? 'visoko' : 'srednje'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {selectedIndices.has(idx) && (
                  <div className="ml-6 space-y-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">{t('business.debts.contact', 'Kontakt / Tvrtka')}</Label>
                      <Input
                        value={loan.contactName}
                        onChange={(e) => updateLoan(idx, { contactName: e.target.value })}
                        className="h-8 text-xs"
                        placeholder="Ime kontakta"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">{t('business.debts.type', 'Vrsta')}</Label>
                      <Select value={loan.type} onValueChange={(v: any) => updateLoan(idx, { type: v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receivable">
                            <span className="flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3 text-income" />
                              {t('business.debts.receivable', 'Potraživanje (duguju meni)')}
                            </span>
                          </SelectItem>
                          <SelectItem value="payable">
                            <span className="flex items-center gap-1">
                              <ArrowDownRight className="w-3 h-3 text-expense" />
                              {t('business.debts.payable', 'Dugovanje (ja dugujem)')}
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Odustani')}
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={selectedIndices.size === 0}>
            {t('business.debts.addSelected', 'Dodaj odabrane')} ({selectedIndices.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
