import { useState } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, Check, Trash2, ScanSearch, Loader2, Wrench } from 'lucide-react';
import { LoanResolveDialog } from './LoanResolveDialog';
import { BusinessDebt } from '@/types/businessDebt';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useBusinessDebts } from '@/hooks/useBusinessDebts';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useLoanDetection, DetectedLoan } from '@/hooks/useLoanDetection';
import { LoanDetectionDialog } from './LoanDetectionDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { getDateRange, toInputDate, clampInputDate, getDateValidationKey } from '@/lib/dateValidation';

export const BusinessDebtTracker = () => {
  const { formatAmount } = useCurrency();
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { debts, loading, addDebt, updateDebt, deleteDebt, totalReceivable, totalPayable, refetch } = useBusinessDebts();
  const { detectLoans } = useLoanDetection();
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detectedLoans, setDetectedLoans] = useState<DetectedLoan[]>([]);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [resolveDebt, setResolveDebt] = useState<BusinessDebt | null>(null);

  const [formType, setFormType] = useState<'receivable' | 'payable'>('receivable');
  const [formContact, setFormContact] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const resetForm = () => {
    setFormType('receivable');
    setFormContact('');
    setFormDesc('');
    setFormAmount('');
    setFormDueDate('');
  };

  const handleAdd = () => {
    if (!formContact || !formAmount || !activeBusinessProfileId) return;
    addDebt({
      business_profile_id: activeBusinessProfileId,
      type: formType,
      contact_name: formContact,
      description: formDesc || null,
      amount: parseFloat(formAmount),
      paid_amount: 0,
      due_date: formDueDate || null,
      status: 'active',
    });
    setAddOpen(false);
    resetForm();
  };

  const markAsPaid = (id: string) => {
    const debt = debts.find(d => d.id === id);
    if (debt) updateDebt(id, { status: 'paid', paid_amount: debt.amount });
  };

  const handleRetroactiveScan = async () => {
    if (!activeBusinessProfileId || !user) return;
    setScanning(true);
    try {
      // Fetch business transactions directly from DB
      const { data, error } = await supabase
        .from('expenses')
        .select('id, description, amount, type, date')
        .eq('user_id', user.id)
        .eq('business_profile_id', activeBusinessProfileId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const businessTxs = (data || []).map((e: any) => ({
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        type: e.type,
        date: new Date(e.date),
      }));

      if (businessTxs.length === 0) {
        toast.info(t('business.debts.noTransactions', 'Nema transakcija za skeniranje'));
        setScanning(false);
        return;
      }

      const detected = await detectLoans(businessTxs);
      if (detected.length === 0) {
        toast.info(t('business.debts.noLoansFound', 'Nije pronađena nijedna pozajmica u transakcijama'));
      } else {
        setDetectedLoans(detected);
        setLoanDialogOpen(true);
      }
    } catch (e) {
      console.error('Scan error:', e);
      showError(t('toasts.scanError'));
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmLoans = (loans: DetectedLoan[]) => {
    if (!activeBusinessProfileId) return;
    for (const loan of loans) {
      addDebt({
        business_profile_id: activeBusinessProfileId,
        type: loan.type,
        contact_name: loan.contactName,
        description: loan.description,
        amount: loan.amount,
        paid_amount: 0,
        due_date: null,
        status: 'active',
      });
    }
    showSuccess(t('business.debts.loansAdded', { count: loans.length, defaultValue: `Dodano ${loans.length} pozajmica` }));
    setDetectedLoans([]);
  };

  const filtered = filter ? debts.filter(d => d.type === filter) : debts;
  const activeDebts = filtered.filter(d => d.status === 'active' || d.status === 'overdue');
  const paidDebts = filtered.filter(d => d.status === 'paid' || d.status === 'cancelled');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-none shadow-sm bg-income/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ArrowUpRight className="w-3 h-3 text-income" />
              <span className="text-[10px] text-muted-foreground">{t('business.debts.receivables', 'Potraživanja')}</span>
            </div>
            <p className="text-base font-bold text-income">{formatAmount(totalReceivable)}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-expense/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ArrowDownRight className="w-3 h-3 text-expense" />
              <span className="text-[10px] text-muted-foreground">{t('business.debts.payables', 'Dugovanja')}</span>
            </div>
            <p className="text-base font-bold text-expense">{formatAmount(totalPayable)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[
            { value: null, label: t('business.debts.all', 'Sve') },
            { value: 'receivable', label: t('business.debts.receivables', 'Potraživanja') },
            { value: 'payable', label: t('business.debts.payables', 'Dugovanja') },
          ].map(f => (
            <Badge
              key={f.label}
              variant={filter === f.value ? 'default' : 'outline'}
              className="cursor-pointer text-[10px] px-2 py-0.5"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Badge>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleRetroactiveScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
            {t('business.debts.scan', 'Skeniraj')}
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="w-3 h-3" />
            {t('business.debts.new', 'Novo')}
          </Button>
        </div>
      </div>

      {activeDebts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1">{t('business.debts.active', 'Aktivna')} ({activeDebts.length})</p>
          {activeDebts.map(debt => (
            <Card key={debt.id} className="border-none shadow-sm">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {debt.type === 'receivable' ? (
                        <ArrowUpRight className="w-3 h-3 text-income flex-shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 text-expense flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{debt.contact_name}</span>
                    </div>
                    {debt.description && (
                      <p className="text-[10px] text-muted-foreground truncate ml-4">{debt.description}</p>
                    )}
                    {debt.due_date && (
                      <p className="text-[10px] text-muted-foreground ml-4">{t('business.debts.dueDate', 'Rok')}: {format(new Date(debt.due_date), 'dd.MM.yyyy')}</p>
                    )}
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${debt.type === 'receivable' ? 'text-income' : 'text-expense'}`}>
                    {formatAmount(debt.amount - debt.paid_amount)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs" onClick={() => markAsPaid(debt.id)}>
                    <Check className="w-3.5 h-3.5 text-income" />
                    {t('business.debts.markPaid', 'Plaćeno')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 gap-1 text-xs"
                    onClick={() => setResolveDebt(debt as BusinessDebt)}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {t('business.debts.resolve', 'Riješi')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {paidDebts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground px-1">{t('business.debts.paid', 'Plaćeno')} ({paidDebts.length})</p>
          {paidDebts.map(debt => (
            <div key={debt.id} className="flex items-center gap-2 p-3 rounded-xl bg-muted/30">
              <div className="flex-1 min-w-0 opacity-60">
                <span className="text-sm line-through truncate">{debt.contact_name}</span>
              </div>
              <span className="text-xs text-muted-foreground opacity-60">{formatAmount(debt.amount)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 min-h-[44px] min-w-[44px] touch-manipulation"
                onClick={() => {
                  if (confirm(t('business.debts.confirmDelete', 'Obrisati ovaj zapis?'))) deleteDebt(debt.id);
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {debts.length === 0 && !loading && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">{t('business.debts.noDebts', 'Nema zabilježenih dugovanja')}</p>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('business.debts.newDebt', 'Novo dugovanje')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('business.debts.type', 'Vrsta')}</Label>
              <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receivable">{t('business.debts.receivable', 'Potraživanje (duguju meni)')}</SelectItem>
                  <SelectItem value="payable">{t('business.debts.payable', 'Dugovanje (ja dugujem)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('business.debts.contact', 'Kontakt / Tvrtka')}</Label>
              <Input value={formContact} onChange={e => setFormContact(e.target.value)} placeholder={t('common.name', 'Naziv')} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">{t('business.debts.descriptionOptional', 'Opis (opcionalno)')}</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder={t('business.debts.forWhat', 'Za što?')} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('business.debts.amount', 'Iznos')}</Label>
                <Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">{t('business.debts.dueDateOptional', 'Rok (opcionalno)')}</Label>
                {(() => {
                  const r = getDateRange('debt');
                  return (
                    <Input
                      type="date"
                      value={formDueDate}
                      min={toInputDate(r.min)}
                      max={toInputDate(r.max)}
                      onChange={e => setFormDueDate(e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const errKey = getDateValidationKey(v, r);
                        if (errKey) {
                          setFormDueDate(clampInputDate(v, r));
                          showError(t(errKey));
                        }
                      }}
                      className="h-9"
                    />
                  );
                })()}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={!formContact || !formAmount} className="w-full">{t('business.debts.add', 'Dodaj')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoanDetectionDialog
        open={loanDialogOpen}
        onOpenChange={setLoanDialogOpen}
        detectedLoans={detectedLoans}
        onConfirm={handleConfirmLoans}
      />

      <LoanResolveDialog
        debt={resolveDebt}
        open={!!resolveDebt}
        onOpenChange={(o) => { if (!o) setResolveDebt(null); }}
        onResolved={() => { refetch(); }}
        onDelete={async (id) => { await deleteDebt(id); }}
      />
    </div>
  );
};
