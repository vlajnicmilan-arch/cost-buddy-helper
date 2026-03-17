import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProjectCollaborators } from '@/hooks/useProjectCollaborators';
import { ProjectCollaborator, ProjectCollaboratorInput } from '@/types/projectCollaborator';
import { ProjectCollaboratorDialog } from './ProjectCollaboratorDialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Handshake, Building2, Loader2, Target } from 'lucide-react';

interface Milestone {
  id: string;
  name: string;
}

interface ProjectCollaboratorsTabProps {
  projectId: string;
  milestones: Milestone[];
  isManager: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  completed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktivan',
  completed: 'Završen',
  cancelled: 'Otkazan',
};

export const ProjectCollaboratorsTab = ({ projectId, milestones, isManager }: ProjectCollaboratorsTabProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { collaborators, loading, addCollaborator, updateCollaborator, deleteCollaborator, totalCost, totalPaid } = useProjectCollaborators(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCollaborator | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const handleSave = async (data: ProjectCollaboratorInput) => {
    if (editing) {
      await updateCollaborator({ ...editing, ...data });
    } else {
      await addCollaborator(data);
    }
  };

  const getMilestoneName = (id: string | null | undefined) => {
    if (!id) return null;
    return milestones.find(m => m.id === id)?.name || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">{t('collaborators.title', 'Vanjski suradnici')}</h3>
          <Badge variant="secondary">{collaborators.length}</Badge>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            {t('collaborators.add', 'Dodaj')}
          </Button>
        )}
      </div>

      {/* Total */}
      {collaborators.length > 0 && (
        <Card className="p-4 bg-muted/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('collaborators.agreedTotal', 'Dogovoreno ukupno')}:</span>
            <span className="text-lg font-bold text-muted-foreground">{formatAmount(totalCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('collaborators.paidTotal', 'Isplaćeno ukupno')}:</span>
            <span className="text-lg font-bold text-primary">{formatAmount(totalPaid)}</span>
          </div>
        </Card>
      )}

      {/* List */}
      {collaborators.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Handshake className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('collaborators.noCollaborators', 'Nema vanjskih suradnika')}</p>
          <p className="text-sm">{t('collaborators.noCollaboratorsHint', 'Dodajte vanjske suradnike za praćenje troškova i sudjelovanja.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {collaborators.map(c => {
            const milestoneName = getMilestoneName(c.milestone_id);
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium">{c.first_name} {c.last_name}</h4>
                      <Badge className={STATUS_COLORS[c.status] || ''} variant="secondary">
                        {t(`collaborators.status${c.status.charAt(0).toUpperCase() + c.status.slice(1)}`, STATUS_LABELS[c.status] || c.status)}
                      </Badge>
                    </div>

                    {c.company_name && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{c.company_name}</span>
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground mt-1">{c.service_description}</p>

                    {milestoneName && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <Target className="w-3.5 h-3.5" />
                        <span>{milestoneName}</span>
                      </div>
                    )}

                    <div className="mt-2 text-sm font-medium">
                      {t('collaborators.price', 'Cijena')}: <span className="text-primary">{formatAmount(c.total_price)}</span>
                    </div>

                    {c.contact_info && (
                      <p className="text-xs text-muted-foreground mt-1">{c.contact_info}</p>
                    )}
                  </div>

                  {isManager && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setToDelete(c.id); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <ProjectCollaboratorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        collaborator={editing}
        milestones={milestones}
        onSave={handleSave}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('collaborators.deleteTitle', 'Ukloni suradnika?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('collaborators.deleteDescription', 'Ova radnja je nepovratna.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                if (toDelete) {
                  await deleteCollaborator(toDelete);
                  setDeleteConfirmOpen(false);
                  setToDelete(null);
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
