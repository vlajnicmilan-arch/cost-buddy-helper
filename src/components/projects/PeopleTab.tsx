import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, User, ChevronRight, Users } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useWorkerIdentities } from '@/hooks/useWorkerIdentities';
import { PersonDetailDialog } from './PersonDetailDialog';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import type { IdentityGroupSuggestion } from '@/lib/workerIdentity';

/**
 * "Ljudi" — every hourly worker exactly once, across all projects.
 * Read-only: sums what already exists, introduces no new writes on money.
 * Collaborators are intentionally not part of this view.
 */
export const PeopleTab = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { rows, aggregates, people, projectNames, pendingGroups, loading, resolveGroup } =
    useWorkerIdentities();
  const [selected, setSelected] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleResolve = async (group: IdentityGroupSuggestion, same: boolean) => {
    setBusyKey(group.key);
    const ok = await resolveGroup(group, same);
    setBusyKey(null);
    if (ok) showSuccess(t('people.identityConfirmed', 'Spremljeno'));
    else showError(t('common.error'));
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

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('people.empty', 'Još nema ljudi')}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
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
                  {t('people.engagements', '{{count}} angažmana', { count: r.engagementCount })}
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

      <PersonDetailDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        personId={selected}
        name={selectedPerson ? `${selectedPerson.first_name} ${selectedPerson.last_name}` : ''}
        aggregate={selected ? aggregates.get(selected) ?? null : null}
        projectNames={projectNames}
        onPaid={refetch}
      />
    </div>
  );
};
