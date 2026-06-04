import { useState, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectEstimates, ProjectEstimate, EstimateStatus } from '@/hooks/useProjectEstimates';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Plus, FileText, Loader2, Edit, Trash2, FolderPlus, Send, Download, AlertTriangle } from 'lucide-react';

// Lazy-load heavy dialog only when needed
const EstimateDialog = lazy(() => import('./EstimateDialog').then(m => ({ default: m.EstimateDialog })));
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { generateEstimatePdf } from '@/lib/estimatePdf';
import { showError } from '@/hooks/useStatusFeedback';
import { friendlyError } from '@/lib/errorMessages';
import { useSoftDeleteWithUndo } from '@/hooks/useSoftDeleteWithUndo';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Radna verzija',
  sent: 'Poslana',
  accepted: 'Prihvaćena',
  rejected: 'Odbijena',
};

const STATUS_VARIANTS: Record<EstimateStatus, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'outline',
  rejected: 'destructive',
};

interface ProjectEstimatesPanelProps {
  /** When provided, only estimates whose `accepted_project_id` matches are shown
   *  (use case: embedded inside a single project view). */
  projectId?: string;
  /** Hide the title row (caller renders its own header). */
  compact?: boolean;
  /** When true, all write paths are gated with the read-only toast. */
  isReadOnly?: boolean;
}

export const ProjectEstimatesPanel = ({ projectId, compact = false, isReadOnly = false }: ProjectEstimatesPanelProps = {}) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { estimates, loading, deleteEstimate, convertToProject, updateEstimate, refetch } = useProjectEstimates();
  const wrapDeleteWithUndo = useSoftDeleteWithUndo({ onRestored: refetch });
  const { guard } = useProjectWriteGuard({ isReadOnly });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<ProjectEstimate | null>(null);
  const [toDelete, setToDelete] = useState<ProjectEstimate | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const roTitle = isReadOnly ? t('projects.access.readOnlyBlockedToast') : undefined;

  const visibleEstimates = useMemo(() => {
    if (!projectId) return estimates;
    return estimates.filter(e => e.accepted_project_id === projectId);
  }, [estimates, projectId]);

  const handleDownloadPdf = async (est: ProjectEstimate) => {
    setPdfBusyId(est.id);
    try {
      await generateEstimatePdf(est, { currency: { code: currency.code } });
    } catch (err) {
      showError(friendlyError(err, 'errors.generic'));
    } finally {
      setPdfBusyId(null);
    }
  };

  const renderExpiryBadge = (est: ProjectEstimate) => {
    if (!est.valid_until) return null;
    if (est.status !== 'sent' && est.status !== 'draft') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = new Date(est.valid_until);
    until.setHours(0, 0, 0, 0);
    const diffDays = Math.round((until.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) {
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="w-3 h-3" /> {t('estimates.expired', 'Isteklo')}
        </Badge>
      );
    }
    if (diffDays <= 7) {
      return (
        <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
          {t('estimates.expiringIn', 'Istječe za {{n}} d', { n: diffDays })}
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t('estimates.title', 'Ponude / Predračuni')}
          </h3>
          <Button size="sm" onClick={() => { if (!guard()) return; setEditingEstimate(null); setDialogOpen(true); }} disabled={isReadOnly} title={roTitle}>
            <Plus className="w-4 h-4 mr-1" />
            {t('estimates.add', 'Nova ponuda')}
          </Button>
        </div>
      )}
      {compact && (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={() => { if (!guard()) return; setEditingEstimate(null); setDialogOpen(true); }} disabled={isReadOnly} title={roTitle}>
            <Plus className="w-4 h-4 mr-1" />
            {t('estimates.add', 'Nova ponuda')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleEstimates.length === 0 ? (
        <EmptyState
          variant="generic"
          title={t('estimates.empty', 'Nema ponuda')}
          description={projectId
            ? t('estimates.emptyForProject', 'Nema ponuda vezanih za ovaj projekt.')
            : t('estimates.emptyHint', 'Kreirajte ponudu i pošaljite je klijentu. Po prihvaćanju je možete pretvoriti u projekt.')}
        />
      ) : (
        <div className="space-y-2">
          {visibleEstimates.map((est) => (
            <div key={est.id} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{est.estimate_number}</p>
                    <Badge variant={STATUS_VARIANTS[est.status]} className="text-[10px]">
                      {t(`estimates.status.${est.status}`, STATUS_LABELS[est.status])}
                    </Badge>
                    {renderExpiryBadge(est)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{est.client_name}</p>
                  <p className="text-xs mt-1">
                    {format(new Date(est.created_at), 'd. MMM yyyy', { locale: hr })}
                    {est.valid_until && (
                      <span className="text-muted-foreground ml-2">
                        · {t('estimates.validUntil', 'vrijedi do')} {format(new Date(est.valid_until), 'd. MMM yyyy', { locale: hr })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatAmount(est.total_amount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 flex-wrap justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadPdf(est)}
                  disabled={pdfBusyId === est.id}
                  title={t('estimates.downloadPdf', 'Preuzmi PDF')}
                >
                  {pdfBusyId === est.id
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <Download className="w-3.5 h-3.5 mr-1" />}
                  PDF
                </Button>
                {est.status === 'draft' && (
                  <Button variant="ghost" size="sm" onClick={() => { if (!guard()) return; updateEstimate(est.id, { status: 'sent' }); }} disabled={isReadOnly} title={roTitle}>
                    <Send className="w-3.5 h-3.5 mr-1" /> {t('estimates.markSent', 'Označi poslano')}
                  </Button>
                )}
                {(est.status === 'sent' || est.status === 'draft') && !est.accepted_project_id && (
                  <Button variant="default" size="sm" onClick={() => { if (!guard()) return; convertToProject(est); }} disabled={isReadOnly} title={roTitle}>
                    <FolderPlus className="w-3.5 h-3.5 mr-1" /> {t('estimates.convertToProject', 'Pretvori u projekt')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { if (!guard()) return; setEditingEstimate(est); setDialogOpen(true); }} disabled={isReadOnly} title={roTitle}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { if (!guard()) return; setToDelete(est); }} disabled={isReadOnly} title={roTitle}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <Suspense fallback={null}>
          <EstimateDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            estimate={editingEstimate}
          />
        </Suspense>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('estimates.deleteTitle', 'Obriši ponudu?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDelete', 'Ova radnja je nepovratna.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (toDelete) { const id = toDelete.id; await wrapDeleteWithUndo(() => deleteEstimate(id), 'estimate', id); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
