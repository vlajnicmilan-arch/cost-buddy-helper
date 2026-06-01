import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFamilySplitAudit } from '@/hooks/useFamilySplitAudit';

interface Props {
  groupId: string;
  /** Collapsed by default to keep the tab uncluttered. */
  defaultOpen?: boolean;
}

/**
 * Collapsible audit timeline for a family group. Reads from family_split_audit
 * through useFamilySplitAudit. Each row shows actor + action + timestamp.
 */
export function FamilySplitAuditTimeline({ groupId, defaultOpen = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const { rows, loading } = useFamilySplitAudit(groupId, 50);

  const actionLabel = (a: string) =>
    t(`family.split.audit.actions.${a}`, a);

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {t('family.split.audit.title', 'Povijest promjena')}
          </span>
          {rows.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5">
              {rows.length}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('common.loading', 'Učitavam…')}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('family.split.audit.empty', 'Nema zapisa.')}
            </p>
          ) : (
            <ol className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="text-xs flex flex-col gap-0.5 border-l-2 border-primary/30 pl-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate">
                      {r.actor_name || t('family.unknownMember', 'Član')}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {actionLabel(r.action)}
                    {r.entity_type && (
                      <span className="opacity-70"> · {r.entity_type}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
