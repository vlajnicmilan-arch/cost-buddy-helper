import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface PushLog {
  id: string;
  created_at: string;
  user_id: string | null;
  source_function: string | null;
  title: string | null;
  body: string | null;
  token_count: number;
  success_count: number;
  failure_count: number;
  fcm_error_codes: string[] | null;
  request_payload: any;
  response_summary: any;
  duration_ms: number | null;
  user_display_name?: string;
  user_email?: string;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Svi' },
  { value: 'success', label: 'Samo uspješni' },
  { value: 'failure', label: 'Samo greške' },
  { value: 'partial', label: 'Djelomični' },
];

const TIME_OPTIONS = [
  { value: '1', label: 'Zadnjih 24h' },
  { value: '7', label: 'Zadnjih 7 dana' },
  { value: '30', label: 'Zadnjih 30 dana' },
];

export const PushLogsTab = () => {
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('7');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchUser, setSearchUser] = useState('');
  const [sources, setSources] = useState<string[]>([]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(timeFilter, 10));

      let query = supabase
        .from('push_delivery_logs')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      if (sourceFilter !== 'all') {
        query = query.eq('source_function', sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as PushLog[];

      // Fetch profiles for users
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
      let profileMap = new Map<string, { display_name: string | null }>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, { display_name: p.display_name }]));
      }

      const enriched = rows.map((r) => ({
        ...r,
        user_display_name: r.user_id ? profileMap.get(r.user_id)?.display_name || undefined : undefined,
      }));

      setLogs(enriched);

      // Build dynamic source list
      const uniqueSources = Array.from(
        new Set(enriched.map((r) => r.source_function).filter(Boolean) as string[])
      ).sort();
      setSources(uniqueSources);
    } catch (err) {
      console.error('Error loading push logs:', err);
    }
    setLoading(false);
  }, [timeFilter, sourceFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter((log) => {
    // Status filter
    if (statusFilter === 'success' && (log.failure_count > 0 || log.success_count === 0)) return false;
    if (statusFilter === 'failure' && log.failure_count === 0) return false;
    if (statusFilter === 'partial' && (log.failure_count === 0 || log.success_count === 0)) return false;

    // User search
    if (searchUser.trim()) {
      const q = searchUser.trim().toLowerCase();
      const name = (log.user_display_name || '').toLowerCase();
      const id = (log.user_id || '').toLowerCase();
      if (!name.includes(q) && !id.includes(q)) return false;
    }
    return true;
  });

  const getStatus = (log: PushLog) => {
    if (log.token_count === 0) {
      return { icon: AlertTriangle, color: 'text-amber-500', label: 'Nema tokena', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    }
    if (log.success_count > 0 && log.failure_count === 0) {
      return { icon: CheckCircle2, color: 'text-emerald-500', label: 'Uspjeh', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' };
    }
    if (log.success_count > 0 && log.failure_count > 0) {
      return { icon: AlertTriangle, color: 'text-amber-500', label: 'Djelomično', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
    }
    return { icon: XCircle, color: 'text-rose-500', label: 'Greška', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' };
  };

  const stats = {
    total: filtered.length,
    success: filtered.filter((l) => l.success_count > 0 && l.failure_count === 0).length,
    failure: filtered.filter((l) => l.success_count === 0 && l.token_count > 0).length,
    noTokens: filtered.filter((l) => l.token_count === 0).length,
  };

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Ukupno</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Uspjeh</p>
          <p className="text-lg font-bold text-emerald-600">{stats.success}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Greška</p>
          <p className="text-lg font-bold text-rose-600">{stats.failure}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Bez tokena</p>
          <p className="text-lg font-bold text-amber-600">{stats.noTokens}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Izvor funkcija" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Sve funkcije</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Pretraži korisnika..."
          value={searchUser}
          onChange={(e) => setSearchUser(e.target.value)}
          className="h-9 text-xs"
        />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading} className="h-8 text-xs">
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Osvježi
        </Button>
      </div>

      {/* Logs */}
      {loading && logs.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nema zapisa za odabrane filtere.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const status = getStatus(log);
            const Icon = status.icon;
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="bg-card border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${status.color}`} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          {log.source_function || 'unknown'}
                        </Badge>
                        <Badge className={`text-[10px] h-5 px-1.5 border-0 ${status.cls}`}>
                          {status.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(log.created_at), 'dd.MM. HH:mm:ss', { locale: hr })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{log.title || '(bez naslova)'}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{log.body || ''}</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>👤 {log.user_display_name || log.user_id?.substring(0, 8) || '—'}</span>
                        <span>🎯 {log.success_count}/{log.token_count} tokena</span>
                        {log.duration_ms != null && <span>⏱ {log.duration_ms}ms</span>}
                        {log.fcm_error_codes && log.fcm_error_codes.length > 0 && (
                          <span className="text-rose-600">⚠ {log.fcm_error_codes.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t bg-muted/30 p-3 space-y-2">
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">User ID</p>
                      <code className="text-[11px] break-all">{log.user_id || '—'}</code>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Request payload</p>
                      <pre className="text-[10px] bg-background p-2 rounded border overflow-auto max-h-40">{JSON.stringify(log.request_payload, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Response summary</p>
                      <pre className="text-[10px] bg-background p-2 rounded border overflow-auto max-h-40">{JSON.stringify(log.response_summary, null, 2)}</pre>
                    </div>
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
