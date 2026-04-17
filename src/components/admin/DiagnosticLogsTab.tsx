import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Trash2, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';

interface DiagnosticLog {
  id: string;
  session_id: string;
  user_id: string | null;
  event: string;
  route: string | null;
  details: any;
  device_info: any;
  app_version: string | null;
  created_at: string;
}

interface SessionGroup {
  session_id: string;
  user_id: string | null;
  app_version: string | null;
  device_info: any;
  first_at: string;
  last_at: string;
  events: DiagnosticLog[];
}

const eventColor = (event: string): string => {
  if (event.includes('error') || event.includes('rejection')) {
    return 'bg-destructive/15 text-destructive';
  }
  if (event.includes('success') || event.includes('mounted')) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  }
  if (event.includes('touch') || event.includes('pointer')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
  }
  if (event.includes('boot') || event.includes('splash')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-400';
  }
  if (event.includes('route')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  }
  return 'bg-muted text-muted-foreground';
};

const platformLabel = (info: any): string => {
  if (!info) return 'Nepoznat';
  const parts: string[] = [];
  if (info.isCapacitor) parts.push(`📱 ${info.platform || 'native'}`);
  else if (info.standalone) parts.push('PWA');
  else parts.push('Web');
  if (info.viewport) parts.push(`${info.viewport.w}×${info.viewport.h}`);
  return parts.join(' · ');
};

export const DiagnosticLogsTab = () => {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_diagnostics_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      showError('Greška pri učitavanju logova');
      console.error(error);
    } else {
      setLogs(data as DiagnosticLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('diagnostic-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_diagnostics_logs' },
        (payload) => {
          setLogs((prev) => {
            const newLog = payload.new as DiagnosticLog;
            // dedupe by id
            if (prev.some((l) => l.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 500);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Periodic auto-refresh as a safety net (in case realtime drops)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const sessions: SessionGroup[] = useMemo(() => {
    const map = new Map<string, SessionGroup>();
    for (const log of logs) {
      let group = map.get(log.session_id);
      if (!group) {
        group = {
          session_id: log.session_id,
          user_id: log.user_id,
          app_version: log.app_version,
          device_info: log.device_info,
          first_at: log.created_at,
          last_at: log.created_at,
          events: [],
        };
        map.set(log.session_id, group);
      }
      group.events.push(log);
      if (log.created_at < group.first_at) group.first_at = log.created_at;
      if (log.created_at > group.last_at) group.last_at = log.created_at;
      if (log.user_id && !group.user_id) group.user_id = log.user_id;
    }
    // Sort events within each session ascending (chronological timeline)
    for (const group of map.values()) {
      group.events.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    // Sort sessions by most recent activity
    return Array.from(map.values()).sort((a, b) => b.last_at.localeCompare(a.last_at));
  }, [logs]);

  const filteredSessions = useMemo(() => {
    if (!filter.trim()) return sessions;
    const q = filter.toLowerCase();
    return sessions.filter((s) =>
      s.session_id.toLowerCase().includes(q) ||
      s.user_id?.toLowerCase().includes(q) ||
      s.events.some((e) =>
        e.event.toLowerCase().includes(q) ||
        e.route?.toLowerCase().includes(q)
      )
    );
  }, [sessions, filter]);

  const deleteAllOldLogs = async () => {
    if (!confirm('Obrisati sve dijagnostičke logove starije od 24h?')) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('app_diagnostics_logs')
      .delete()
      .lt('created_at', cutoff);
    if (error) {
      showError('Greška pri brisanju');
    } else {
      showSuccess('Stari logovi obrisani');
      await loadLogs();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Filtriraj po eventu, ruti, korisniku..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className={autoRefresh ? 'border-primary text-primary' : ''}
          >
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            {autoRefresh ? 'Live' : 'Pauza'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void deleteAllOldLogs()}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filteredSessions.length} sesija · {logs.length} eventova
        {autoRefresh && <span className="ml-2 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> uživo</span>}
      </div>

      {loading && logs.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          Nema dijagnostičkih logova. Otvori APK ili web aplikaciju da bi se pojavili eventovi.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session) => {
            const isOpen = expandedSession === session.session_id;
            const hasError = session.events.some((e) => e.event.includes('error') || e.event.includes('rejection'));
            const lastEvent = session.events[session.events.length - 1]?.event;
            return (
              <div key={session.session_id} className="border rounded-xl bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedSession(isOpen ? null : session.session_id)}
                  className="w-full p-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-foreground truncate">
                          {session.session_id}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {session.events.length} eventova
                        </Badge>
                        {hasError && (
                          <Badge className="bg-destructive/15 text-destructive text-[10px] h-4 px-1.5">
                            greška
                          </Badge>
                        )}
                        {session.app_version && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            v{session.app_version}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 truncate">
                        {platformLabel(session.device_info)}
                        {session.user_id && <span> · 👤 {session.user_id.slice(0, 8)}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(session.last_at), 'dd.MM. HH:mm:ss', { locale: hr })}
                        {' · zadnji: '}
                        <span className="font-mono">{lastEvent}</span>
                      </div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-3 space-y-1.5">
                    <div className="text-[11px] text-muted-foreground mb-2 font-mono break-all">
                      UA: {session.device_info?.ua}
                    </div>
                    {session.events.map((ev) => (
                      <div key={ev.id} className="text-xs flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                        <span className="font-mono text-muted-foreground shrink-0 w-20">
                          {format(new Date(ev.created_at), 'HH:mm:ss.SSS').slice(0, 12)}
                        </span>
                        <Badge className={`${eventColor(ev.event)} text-[10px] h-4 px-1.5 font-mono shrink-0`}>
                          {ev.event}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          {ev.route && (
                            <div className="text-[11px] text-muted-foreground font-mono truncate">
                              {ev.route}
                            </div>
                          )}
                          {ev.details && (
                            <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all mt-0.5">
                              {JSON.stringify(ev.details, null, 0)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
