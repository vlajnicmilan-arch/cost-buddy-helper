import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

interface FeedRow {
  id: string;
  event: string;
  route: string | null;
  session_id: string;
  app_version: string | null;
  details: any;
  created_at: string;
}

const eventColor = (event: string): string => {
  if (event === 'window_error' || event === 'unhandled_rejection') {
    return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30';
  }
  if (event === 'performance_metric') {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
  }
  if (event.startsWith('boot') || event.startsWith('app_')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30';
  }
  return 'bg-muted text-muted-foreground border-border';
};

export const PulseLiveFeed = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FeedRow[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase
        .from('app_diagnostics_logs')
        .select('id, event, route, session_id, app_version, details, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (mounted && data) setRows(data as FeedRow[]);
    };

    load();

    const channel = supabase
      .channel('pulse-live-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_diagnostics_logs' },
        (payload) => {
          if (!mounted) return;
          setRows((prev) => [payload.new as FeedRow, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        {t('admin.pulse.feedEmpty', 'Nema nedavnih događaja.')}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-96 overflow-y-auto">
      {rows.map((r) => {
        const msg = r.details?.message
          ? String(r.details.message).split('\n')[0].slice(0, 100)
          : null;
        return (
          <div
            key={r.id}
            className="flex items-start gap-2 text-xs border-b border-border/50 pb-1.5"
          >
            <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 ${eventColor(r.event)}`}>
              {r.event}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                <span>{format(new Date(r.created_at), 'HH:mm:ss')}</span>
                {r.route && <span className="truncate">· {r.route}</span>}
                {r.app_version && <span>· v{r.app_version}</span>}
              </div>
              {msg && <div className="text-foreground truncate">{msg}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
