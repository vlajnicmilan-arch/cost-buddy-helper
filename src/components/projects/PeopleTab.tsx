import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, ChevronRight, Users, Plus } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAppState } from '@/contexts/AppStateContext';
import { useWorkerIdentities } from '@/hooks/useWorkerIdentities';
import { useWorkerIdentityAttach } from '@/hooks/useWorkerIdentityAttach';
import { PersonDetailDialog } from './PersonDetailDialog';
import { AddPersonDialog, type AddPersonSubmit } from './AddPersonDialog';
import { ExistingPersonPromptDialog } from './ExistingPersonPromptDialog';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { buildAddPersonPlan, engagementInsertPayload } from '@/lib/addPersonPlan';
import type { IdentityGroupSuggestion } from '@/lib/workerIdentity';

/**
 * "Ljudi" — every hourly worker exactly once, across all projects.
 * Adding a person here creates one identity plus one engagement per project.
 * Collaborators are intentionally not part of this view.
 */
export const PeopleTab = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const { rows, archivedRows, aggregates, people, projectNames, pendingGroups, loading, resolveGroup, refetch } =
    useWorkerIdentities();
  const { findMatch, refetch: refetchIdentities } = useWorkerIdentityAttach();
  const [selected, setSelected] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{
    data: AddPersonSubmit;
    matchId: string;
    name: string;
  } | null>(null);

  const projectOptions = Object.entries(projectNames).map(([id, name]) => ({ id, name }));
  const archivedIds = new Set(archivedRows.map((r) => r.workerId));


  const handleResolve = async (group: IdentityGroupSuggestion, same: boolean) => {
    setBusyKey(group.key);
    const ok = await resolveGroup(group, same);
    setBusyKey(null);
    if (ok) showSuccess(t('people.identityConfirmed', 'Spremljeno'));
    else showError(t('common.error'));
  };

  /** Writes at most one `workers` row plus one `project_workers` row per project. */
  const persistPerson = async (data: AddPersonSubmit, existingWorkerId: string | null) => {
    if (!user) return;
    const plan = buildAddPersonPlan(
      { firstName: data.firstName, lastName: data.lastName, selections: data.selections },
      { existingWorkerId },
    );
    if (!plan.valid) return;

    setSaving(true);
    try {
      let workerId = existingWorkerId;
      if (!workerId) {
        const { data: created, error } = await supabase
          .from('workers')
          .insert({
            user_id: user.id,
            business_profile_id: activeBusinessProfileId ?? null,
            first_name: plan.firstName,
            last_name: plan.lastName,
          })
          .select('id')
          .single();
        if (error) {
          logDiagnostic({
            event: 'person_bulk_create_failed',
            severity: 'error',
            details: {
              worker_id: null,
              project_id: null,
              index: 0,
              total: plan.engagements.length,
              db_code: error.code ?? null,
              db_message: error.message,
            },
          });
          showError(t('people.add.failedPerson', 'Osoba nije spremljena: {{reason}}', { reason: error.message }));
          return;
        }
        workerId = (created as any).id as string;
      }

      let createdCount = 0;
      const failures: string[] = [];
      for (let i = 0; i < plan.engagements.length; i++) {
        const eng = plan.engagements[i];
        const { error } = await (supabase.from('project_workers') as any).insert(
          engagementInsertPayload(plan, eng, workerId),
        );
        if (error) {
          failures.push(projectNames[eng.projectId] ?? eng.projectId);
          logDiagnostic({
            event: 'person_bulk_create_failed',
            severity: 'error',
            details: {
              worker_id: workerId,
              project_id: eng.projectId,
              index: i,
              total: plan.engagements.length,
              db_code: error.code ?? null,
              db_message: error.message,
            },
          });
          showError(
            t('people.add.failedEngagement', 'Projekt {{project}}: {{reason}}', {
              project: projectNames[eng.projectId] ?? eng.projectId,
              reason: error.message,
            }),
          );
          continue;
        }
        createdCount++;
      }

      if (createdCount > 0) {
        logDiagnostic({
          event: 'person_bulk_create_ok',
          severity: 'info',
          details: { worker_id: workerId, engagements: createdCount, total: plan.engagements.length },
        });
      }
      if (failures.length === 0) {
        showSuccess(t('people.add.saved', 'Osoba dodana'));
        setAddOpen(false);
      }
      await Promise.all([refetch(), refetchIdentities()]);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (data: AddPersonSubmit) => {
    const match = findMatch(data.firstName.trim(), data.lastName.trim(), activeBusinessProfileId ?? null);
    if (match) {
      setPendingSubmit({
        data,
        matchId: match.id,
        name: `${match.first_name} ${match.last_name}`.trim(),
      });
      return;
    }
    await persistPerson(data, null);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedPerson = people.find((p) => p.id === selected) || null;

  return (
    <div className="space-y-3">
      <Button className="w-full min-h-[44px]" variant="outline" onClick={() => setAddOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" />
        {t('people.add.open', '+ Osoba')}
      </Button>

      {pendingGroups.length > 0 && (

        <Card className="p-3 space-y-3 border-primary/40">
          <p className="text-sm font-medium">{t('people.migrationTitle', 'Poveži angažmane s osobama')}</p>
          {pendingGroups.map((g) => (
            <div key={g.key} className="rounded-lg border border-border/50 p-3 space-y-2">
              <p className="text-sm">
                {g.needsConfirmation
                  ? t('people.migrationQuestion', '{{name}} se pojavljuje na {{count}} projekta — je li to ista osoba?', {
                      name: `${g.firstName} ${g.lastName}`.trim(),
                      count: g.projectIds.length || g.engagementIds.length,
                    })
                  : t('people.migrationSingle', '{{name}} — dodaj među Ljude.', {
                      name: `${g.firstName} ${g.lastName}`.trim(),
                    })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="min-h-[44px]"
                  disabled={busyKey === g.key}
                  onClick={() => handleResolve(g, true)}
                >
                  {busyKey === g.key && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                  {g.needsConfirmation
                    ? t('people.sameYes', 'Da, isti')
                    : t('people.addToPeople', 'Dodaj među Ljude')}
                </Button>
                {g.needsConfirmation && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    disabled={busyKey === g.key}
                    onClick={() => handleResolve(g, false)}
                  >
                    {t('people.sameNo', 'Ne, druge osobe')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {rows.length === 0 && !showArchived ? (
        <Card className="p-8 text-center">
          <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('people.empty', 'Još nema ljudi')}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {(showArchived ? [...rows, ...archivedRows] : rows).map((r) => (
            <button
              key={r.workerId}
              type="button"
              onClick={() => setSelected(r.workerId)}
              className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3 text-left min-h-[44px] hover:bg-muted/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.firstName} {r.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {archivedIds.has(r.workerId)
                    ? t('people.admin.archivedLabel', 'Arhivirano')
                    : t('people.engagements', '{{count}} angažmana', { count: r.engagementCount })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">{t('people.remaining', 'Ostaje za isplatu')}</p>
                <Badge variant="secondary" className="text-xs">
                  {formatAmount(r.remaining)}
                </Badge>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {(archivedRows.length > 0 || showArchived) && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full min-h-[44px] text-xs text-muted-foreground"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived
            ? t('people.admin.hideArchived', 'Sakrij arhivirane')
            : t('people.admin.showArchived', 'Prikaži arhivirane ({{count}})', {
                count: archivedRows.length,
              })}
        </Button>
      )}

      <PersonDetailDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        personId={selected}
        name={selectedPerson ? `${selectedPerson.first_name} ${selectedPerson.last_name}` : ''}
        firstName={selectedPerson?.first_name ?? ''}
        lastName={selectedPerson?.last_name ?? ''}
        archived={!!selectedPerson?.archived_at}
        aggregate={selected ? aggregates.get(selected) ?? null : null}
        projectNames={projectNames}
        linkedUserId={selectedPerson?.linked_user_id ?? null}
        onPaid={refetch}
      />


      <AddPersonDialog
        open={addOpen}
        onOpenChange={(o) => !o && setAddOpen(false)}
        projects={projectOptions}
        saving={saving}
        onSubmit={handleSubmit}
      />

      <ExistingPersonPromptDialog
        open={!!pendingSubmit}
        name={pendingSubmit?.name ?? ''}
        onUseExisting={() => {
          const p = pendingSubmit;
          setPendingSubmit(null);
          if (p) void persistPerson(p.data, p.matchId);
        }}
        onDifferentPerson={() => {
          const p = pendingSubmit;
          setPendingSubmit(null);
          if (p) void persistPerson(p.data, null);
        }}
      />
    </div>

  );
};
