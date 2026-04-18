import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectEstimates, ProjectEstimate, EstimateStatus } from '@/hooks/useProjectEstimates';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { EstimateDialog } from './EstimateDialog';
import { Plus, FileText, Loader2, Edit, Trash2, FolderPlus, Send } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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

export const ProjectEstimatesPanel = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { estimates, loading, deleteEstimate, convertToProject, updateEstimate } = useProjectEstimates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<ProjectEstimate | null>(null);
  const [toDelete, setToDelete] = useState<ProjectEstimate | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          {t('estimates.title', 'Ponude / Predračuni')}
        </h3>
        <Button size="sm" onClick={() => { setEditingEstimate(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          {t('estimates.add', 'Nova ponuda')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : estimates.length === 0 ? (
        <EmptyState
          variant="generic"
          title={t('estimates.empty', 'Nema ponuda')}
          description={t('estimates.emptyHint', 'Kreirajte ponudu i pošaljite je klijentu. Po prihvaćanju je možete pretvoriti u projekt.')}
        />
      ) : (
        <div className="space-y-2">
          {estimates.map((est) => (
            <div key={est.id} className="p-3 rounded-lg border bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{est.estimate_number}</p>
                    <Badge variant={STATUS_VARIANTS[est.status]} className="text-[10px]">
                      {t(`estimates.status.${est.status}`, STATUS_LABELS[est.status])}
                    </Badge>
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
                {est.status === 'draft' && (
                  <Button variant="ghost" size="sm" onClick={() => updateEstimate(est.id, { status: 'sent' })}>
                    <Send className="w-3.5 h-3.5 mr-1" /> {t('estimates.markSent', 'Označi poslano')}
                  </Button>
                )}
                {est.status === 'sent' && !est.accepted_project_id && (
                  <Button variant="default" size="sm" onClick={() => convertToProject(est)}>
                    <FolderPlus className="w-3.5 h-3.5 mr-1" /> {t('estimates.convertToProject', 'Pretvori u projekt')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setEditingEstimate(est); setDialogOpen(true); }}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setToDelete(est)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EstimateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        estimate={editingEstimate}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('estimates.deleteTitle', 'Obriši ponudu?')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.confirmDelete', 'Ova radnja je nepovratna.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (toDelete) { await deleteEstimate(toDelete.id); setToDelete(null); } }}
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
