import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { ProjectWithOwnership, ProjectMilestone } from '@/types/project';
import {
  CheckCircle2, Circle, AlertTriangle, FileText, Archive, ChevronRight, ChevronLeft, Flag, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';

type Step = 1 | 2 | 3;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithOwnership;
  milestones: ProjectMilestone[];
  totalSpent: number;
  totalAllocated: number;
  /** Open the existing reports dialog so the user can generate the final report. */
  onOpenReports: () => void;
  /** Called after successful completion. Parent should refresh data and close the project view. */
  onCompleted: (archived: boolean) => void;
}

export const CompleteProjectWizard = ({
  open,
  onOpenChange,
  project,
  milestones,
  totalSpent,
  totalAllocated,
  onOpenReports,
  onCompleted,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 state
  const openMilestones = useMemo(
    () => milestones.filter(m => m.status !== 'completed'),
    [milestones],
  );
  const [milestoneDecisions, setMilestoneDecisions] = useState<Record<string, boolean>>({});
  const overdueCount = openMilestones.filter(m => m.status === 'overdue').length;

  // Step 2 state
  const [reportAcknowledged, setReportAcknowledged] = useState(false);
  const profitLoss = totalAllocated - totalSpent;

  // Step 3 state
  const [endDate, setEndDate] = useState<string>(
    project.end_date || format(new Date(), 'yyyy-MM-dd'),
  );
  const [closingNote, setClosingNote] = useState('');
  const [archiveChoice, setArchiveChoice] = useState<'archive' | 'keep'>('archive');

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setSubmitting(false);
      const initial: Record<string, boolean> = {};
      openMilestones.forEach(m => {
        initial[m.id] = m.status === 'in_progress' || m.status === 'overdue';
      });
      setMilestoneDecisions(initial);
      setReportAcknowledged(false);
      setEndDate(project.end_date || format(new Date(), 'yyyy-MM-dd'));
      setClosingNote('');
      setArchiveChoice('archive');
    }
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMilestone = (id: string) => {
    setMilestoneDecisions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNext = async () => {
    if (step === 1) {
      // Bulk-mark selected milestones as completed
      const idsToComplete = Object.entries(milestoneDecisions)
        .filter(([, v]) => v)
        .map(([id]) => id);

      if (idsToComplete.length > 0) {
        try {
          setSubmitting(true);
          const { error } = await supabase
            .from('project_milestones')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .in('id', idsToComplete);
          if (error) throw error;
          showSuccess(t('projects.complete.milestonesUpdated', 'Faze ažurirane'));
        } catch (e) {
          console.error('Bulk milestone complete error:', e);
          showError(t('common.error'));
          setSubmitting(false);
          return;
        } finally {
          setSubmitting(false);
        }
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      await handleFinalize();
    }
  };

  const handleBack = () => {
    if (step === 1) {
      onOpenChange(false);
    } else {
      setStep((step - 1) as Step);
    }
  };

  const handleFinalize = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const archived = archiveChoice === 'archive';
      const updates: Record<string, any> = {
        status: 'completed',
        end_date: endDate,
        archived_at: archived ? new Date().toISOString() : null,
      };

      if (closingNote.trim()) {
        const stamp = format(new Date(), 'dd.MM.yyyy');
        const header = t('projects.complete.notePrefix', 'Završeno');
        const appended = `${project.description ? project.description + '\n\n' : ''}--- ${header} ${stamp} ---\n${closingNote.trim()}`;
        updates.description = appended;
      }

      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', project.id);
      if (error) throw error;

      showSuccess(t('projects.complete.success', 'Projekt završen'));
      onOpenChange(false);
      onCompleted(archived);
    } catch (e) {
      console.error('Project complete error:', e);
      showError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabel: Record<Step, string> = {
    1: t('projects.complete.step1Title', 'Provjera faza'),
    2: t('projects.complete.step2Title', 'Završni izvještaj'),
    3: t('projects.complete.step3Title', 'Završetak i arhiva'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg z-[60] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Flag className="w-3.5 h-3.5" />
            <span>{t('projects.complete.dialogKicker', 'Završi projekt')}</span>
            <span className="ml-auto">{step} / 3</span>
          </div>
          <DialogTitle className="text-lg">{stepLabel[step]}</DialogTitle>
          <DialogDescription className="text-xs">
            {project.name}
          </DialogDescription>
          {/* Progress bar */}
          <div className="flex gap-1 mt-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= step ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('projects.complete.step1Hint', 'Označi faze koje su zapravo gotove. Sve preostale ostat će otvorene.')}
              </p>

              {overdueCount > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    {t('projects.complete.overdueWarn', 'Imaš {{count}} zakašnjelih faza. Razmisli prije nego ih označiš završenima.', { count: overdueCount })}
                  </p>
                </div>
              )}

              {openMilestones.length === 0 ? (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-income/10 border border-income/20">
                  <CheckCircle2 className="w-5 h-5 text-income" />
                  <p className="text-sm">
                    {t('projects.complete.allDone', 'Sve faze su već završene. Kreni dalje.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {openMilestones.map(m => {
                    const checked = !!milestoneDecisions[m.id];
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors min-h-[44px]',
                          checked ? 'bg-primary/5 border-primary/30' : 'bg-card border-border hover:bg-muted/40',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleMilestone(m.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{m.name}</span>
                            {m.status === 'overdue' && (
                              <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                                {t('milestoneStatus.overdue', 'Zakašnjela')}
                              </Badge>
                            )}
                            {m.status === 'in_progress' && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {t('milestoneStatus.in_progress', 'U tijeku')}
                              </Badge>
                            )}
                          </div>
                          {m.due_date && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {t('projects.due', 'Rok')}: {format(new Date(m.due_date), 'dd.MM.yyyy')}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <Separator />
              <div className="text-xs text-muted-foreground">
                {t('projects.complete.summary', '{{done}} od {{total}} faza će biti završeno', {
                  done: milestones.filter(m => m.status === 'completed').length + Object.values(milestoneDecisions).filter(Boolean).length,
                  total: milestones.length,
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('projects.complete.step2Hint', 'Generiraj završni izvještaj prije nego zatvoriš obračun. Možeš ga preuzeti kao PDF ili CSV.')}
              </p>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-lg bg-income/10 text-center">
                  <p className="text-[10px] text-muted-foreground">{t('projects.received', 'Primljeno')}</p>
                  <p className="text-sm font-bold text-income truncate">{formatAmount(totalAllocated)}</p>
                </div>
                <div className="p-3 rounded-lg bg-expense/10 text-center">
                  <p className="text-[10px] text-muted-foreground">{t('projects.spent', 'Potrošeno')}</p>
                  <p className="text-sm font-bold text-expense truncate">{formatAmount(totalSpent)}</p>
                </div>
                <div className={cn('p-3 rounded-lg text-center', profitLoss >= 0 ? 'bg-primary/10' : 'bg-destructive/10')}>
                  <p className="text-[10px] text-muted-foreground">{t('projects.complete.netResult', 'Rezultat')}</p>
                  <p className={cn('text-sm font-bold truncate', profitLoss >= 0 ? 'text-primary' : 'text-destructive')}>
                    {formatAmount(profitLoss)}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  onOpenReports();
                  setReportAcknowledged(true);
                }}
              >
                <FileText className="w-4 h-4" />
                {t('projects.complete.openReports', 'Otvori izvještaje (PDF / CSV)')}
              </Button>

              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer min-h-[44px]">
                <Checkbox
                  checked={reportAcknowledged}
                  onCheckedChange={(v) => setReportAcknowledged(!!v)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  {t('projects.complete.reportAck', 'Generirao/la sam završni izvještaj ili ga ne trebam.')}
                </span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="end-date" className="text-sm">{t('projects.endDate', 'Datum završetka')}</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closing-note" className="text-sm">
                  {t('projects.complete.noteLabel', 'Zaključci / lessons learned (opcionalno)')}
                </Label>
                <Textarea
                  id="closing-note"
                  value={closingNote}
                  onChange={e => setClosingNote(e.target.value)}
                  placeholder={t('projects.complete.notePlaceholder', 'Što je dobro prošlo, što popraviti za sljedeći put...')}
                  rows={4}
                />
              </div>

              <Separator />

              <RadioGroup value={archiveChoice} onValueChange={(v) => setArchiveChoice(v as 'archive' | 'keep')}>
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer min-h-[44px]">
                  <RadioGroupItem value="archive" id="opt-archive" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">
                        {t('projects.complete.optArchive', 'Završi i arhiviraj')}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {t('projects.complete.recommended', 'Preporučeno')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('projects.complete.optArchiveHint', 'Skida projekt iz aktivne liste. Možeš ga vratiti iz Arhive.')}
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer min-h-[44px]">
                  <RadioGroupItem value="keep" id="opt-keep" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-income" />
                      <span className="text-sm font-medium">
                        {t('projects.complete.optKeep', 'Završi, zadrži u listi')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('projects.complete.optKeepHint', 'Status postaje Završen, ali ostaje vidljiv na Projektima.')}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center gap-2 p-4 border-t bg-card">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={submitting}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? t('common.cancel', 'Odustani') : t('common.back', 'Natrag')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={submitting || (step === 2 && !reportAcknowledged)}
            className="ml-auto gap-1 min-w-[120px]"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {step < 3 ? (
              <>
                {t('common.next', 'Dalje')}
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <Flag className="w-4 h-4" />
                {t('projects.complete.finishCta', 'Završi projekt')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
