import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Handshake, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCollaboratorOverview } from '@/hooks/useCollaboratorOverview';
import { CollaboratorDetailDialog } from './CollaboratorDetailDialog';

/**
 * "Suradnici" — every collaborator/subcontractor once, across all projects.
 * Read-only; hourly workers are a separate model and never mixed in here.
 */
export const CollaboratorsTab = () => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { groups, loading } = useCollaboratorOverview();
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedGroup = groups.find((g) => g.key === selected) ?? null;

  return (
    <div className="space-y-3">
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

      <CollaboratorDetailDialog
        open={!!selectedGroup}
        onOpenChange={(o) => !o && setSelected(null)}
        group={selectedGroup}
      />
    </div>
  );
};
