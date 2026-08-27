import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Handshake, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { useCollaboratorOverview } from '@/hooks/useCollaboratorOverview';
import { CollaboratorDetailDialog } from './CollaboratorDetailDialog';
import { ProjectCollaboratorDialog } from './ProjectCollaboratorDialog';
import type { ProjectCollaboratorInput } from '@/types/projectCollaborator';

/**
 * "Suradnici" — every collaborator/subcontractor once, across all projects.
 * Hourly workers are a separate model and never mixed in here.
 */
export const CollaboratorsTab = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const { groups, projectOptions, loading, refetch } = useCollaboratorOverview();
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedGroup = groups.find((g) => g.key === selected) ?? null;

  const handleAdd = async (data: ProjectCollaboratorInput, projectId?: string) => {
    if (!user || !projectId) return;
    try {
      const { error } = await (supabase.from('project_collaborators') as any).insert({
        project_id: projectId,
        first_name: data.first_name,
        last_name: data.last_name,
        company_name: data.company_name || null,
        service_description: data.service_description,
        total_price: data.total_price,
        milestone_id: data.milestone_id || null,
        status: data.status || 'active',
        contact_info: data.contact_info || null,
        note: data.note || null,
      });
      if (error) throw error;
      showSuccess(t('collaborators.added', 'Suradnik dodan'));
      await refetch();
    } catch (e: any) {
      logDiagnostic({
        event: 'collaborator_create_failed',
        severity: 'error',
        details: { db_code: e?.code ?? null, db_message: String(e?.message ?? e), project_id: projectId },
      });
      showError(t('common.error'));
    }
  };

  return (
    <div className="space-y-3">
      {projectOptions.length > 0 && (
        <Button className="w-full min-h-[44px]" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('collaboratorsOverview.add', '+ Suradnik')}
        </Button>
      )}

      {groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Handshake className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('collaboratorsOverview.empty', 'Još nema suradnika')}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const unpricedOnly = g.hasUnpriced && g.agreed === 0 && g.paid === 0;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelected(g.key)}
                className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3 text-left min-h-[44px] hover:bg-muted/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Handshake className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('collaboratorsOverview.engagements', '{{count}} angažmana', {
                      count: g.engagements.length,
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {unpricedOnly ? (
                    <p className="text-xs text-muted-foreground">
                      {t('collaboratorsOverview.noAmount', 'iznos nije upisan')}
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        {t('collaboratorsOverview.remaining', 'Ostaje')}
                      </p>
                      <Badge variant="secondary" className="text-xs">
                        {formatAmount(g.remaining)}
                      </Badge>
                    </>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      <ProjectCollaboratorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        collaborator={null}
        milestones={[]}
        projectOptions={projectOptions}
        onSave={handleAdd}
      />

      <CollaboratorDetailDialog
        open={!!selectedGroup}
        onOpenChange={(o) => !o && setSelected(null)}
        group={selectedGroup}
        onChanged={refetch}
      />
    </div>
  );
};
