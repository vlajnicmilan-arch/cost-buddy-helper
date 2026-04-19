import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  AlertTriangle, Clock, Send, Server, Smartphone, HelpCircle,
} from 'lucide-react';
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
  request_id: string | null;
  dispatch_status: string | null;
  dispatch_error: string | null;
  send_push_http_status: number | null;
  lifecycle_stage: string | null;
  user_display_name?: string;
}

interface GroupedAttempt {
  request_id: string;
  created_at: string;
  user_id: string | null;
  user_display_name?: string;
  source_function: string | null;
  title: string | null;
  body: string | null;
  stages: PushLog[];
  finalStatus: ReturnType<typeof computeFinalStatus>;
}

const TIME_OPTIONS = [
  { value: '1', label: 'Zadnjih 24h' },
  { value: '7', label: 'Zadnjih 7 dana' },
  { value: '30', label: 'Zadnjih 30 dana' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'Sve' },
  { value: 'fcm_success', label: 'FCM uspjeh' },
  { value: 'no_tokens', label: 'Korisnik nema token' },
  { value: 'fcm_failed', label: 'FCM greška' },
  { value: 'never_reached', label: 'send-push neuspjeh' },
];

function computeFinalStatus(stages: PushLog[]) {
  // Pick the most "advanced" stage to determine outcome
  const fcm = stages.find((s) => s.lifecycle_stage === 'fcm');
  const sendPush = stages.find((s) => s.lifecycle_stage === 'send_push');
  const helper = stages.find((s) => s.lifecycle_stage === 'helper' && s.dispatch_status !== 'dispatch_started');
  const helperStarted = stages.find((s) => s.lifecycle_stage === 'helper' && s.dispatch_status === 'dispatch_started');

  if (fcm) {
    if (fcm.dispatch_status === 'fcm_success') {
      return { kind: 'success', label: 'FCM prihvatio', tone: 'green', detail: `Poslano ${fcm.success_count}/${fcm.token_count} tokena` };
    }
    if (fcm.dispatch_status === 'fcm_partial') {
      return { kind: 'partial', label: 'Djelomično', tone: 'amber', detail: `${fcm.success_count}/${fcm.token_count} uspješno` };
    }
    return { kind: 'fcm_failed', label: 'FCM odbio', tone: 'red', detail: fcm.fcm_error_codes?.join(', ') || 'Sve greške' };
  }
  if (sendPush) {
    if (sendPush.dispatch_status === 'send_push_no_tokens') {
      return { kind: 'no_tokens', label: 'Nema tokena', tone: 'amber', detail: 'Korisnik nema registriran uređaj' };
    }
    if (sendPush.dispatch_status === 'send_push_misconfigured') {
      return { kind: 'misconfigured', label: 'FCM konfiguracija', tone: 'red', detail: sendPush.dispatch_error || 'Nedostaje FCM secret' };
    }
    if (sendPush.dispatch_status === 'send_push_token_query_error') {
      return { kind: 'db_error', label: 'DB greška', tone: 'red', detail: sendPush.dispatch_error || '' };
    }
    if (sendPush.dispatch_status === 'send_push_exception') {
      return { kind: 'exception', label: 'send-push iznimka', tone: 'red', detail: sendPush.dispatch_error || '' };
    }
    if (sendPush.dispatch_status === 'send_push_bad_request') {
      return { kind: 'bad_request', label: 'Loš zahtjev', tone: 'red', detail: sendPush.dispatch_error || '' };
    }
  }
  if (helper) {
    if (helper.dispatch_status === 'dispatch_ok') {
      return { kind: 'unknown', label: 'send-push odgovorio', tone: 'amber', detail: 'Nema FCM zapisa — provjeri logove' };
    }
    if (helper.dispatch_status === 'dispatch_http_error') {
      return { kind: 'http_error', label: 'send-push HTTP greška', tone: 'red', detail: helper.dispatch_error || `HTTP ${helper.send_push_http_status}` };
    }
    if (helper.dispatch_status === 'dispatch_network_error') {
      return { kind: 'network_error', label: 'send-push nedostupan', tone: 'red', detail: helper.dispatch_error || 'mrežna greška' };
    }
    if (helper.dispatch_status === 'dispatch_skipped') {
      return { kind: 'skipped', label: 'Preskočeno', tone: 'amber', detail: helper.dispatch_error || '' };
    }
  }
  if (helperStarted) {
    return { kind: 'in_flight', label: 'Pokušaj krenuo', tone: 'amber', detail: 'Nema završnog zapisa — funkcija pukla?' };
  }
  return { kind: 'unknown', label: 'Nepoznato', tone: 'gray', detail: '' };
}

const TONE_CLASSES: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  gray: 'bg-muted text-muted-foreground',
};

const STAGE_META: Record<string, { icon: any; label: string }> = {
  helper: { icon: Send, label: 'Pokušaj slanja' },
  send_push: { icon: Server, label: 'send-push funkcija' },
  fcm: { icon: Smartphone, label: 'FCM (Firebase)' },
};

export const PushLogsTab = () => {
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('1');
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
        .limit(500);

      if (sourceFilter !== 'all') {
        query = query.eq('source_function', sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as PushLog[];

      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
      let profileMap = new Map<string, string | null>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name]));
      }

      const enriched = rows.map((r) => ({
        ...r,
        user_display_name: r.user_id ? profileMap.get(r.user_id) || undefined : undefined,
      }));

      setLogs(enriched);

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

  // Group by request_id (legacy rows without request_id get their own group via id)
  const grouped: GroupedAttempt[] = useMemo(() => {
    const map = new Map<string, PushLog[]>();
    for (const log of logs) {
      const key = log.request_id || `legacy-${log.id}`;
      const arr = map.get(key) || [];
      arr.push(log);
      map.set(key, arr);
    }
    const list: GroupedAttempt[] = [];
    for (const [key, stages] of map.entries()) {
      // Sort stages chronologically
      stages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const first = stages[0];
      list.push({
        request_id: key,
        created_at: first.created_at,
        user_id: first.user_id,
        user_display_name: first.user_display_name,
        source_function: first.source_function,
        title: first.title,
        body: first.body,
        stages,
        finalStatus: computeFinalStatus(stages),
      });
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [logs]);

  const filtered = grouped.filter((g) => {
    if (filter === 'fcm_success' && g.finalStatus.kind !== 'success') return false;
    if (filter === 'no_tokens' && g.finalStatus.kind !== 'no_tokens') return false;
    if (filter === 'fcm_failed' && !['fcm_failed', 'partial'].includes(g.finalStatus.kind)) return false;
    if (filter === 'never_reached' && !['http_error', 'network_error', 'misconfigured', 'exception', 'in_flight'].includes(g.finalStatus.kind)) return false;
    if (searchUser.trim()) {
      const q = searchUser.trim().toLowerCase();
      const name = (g.user_display_name || '').toLowerCase();
      const id = (g.user_id || '').toLowerCase();
      if (!name.includes(q) && !id.includes(q)) return false;
    }
    return true;
  });

  const stats = useMemo(() => ({
    total: filtered.length,
    success: filtered.filter((g) => g.finalStatus.kind === 'success').length,
    failed: filtered.filter((g) => ['fcm_failed', 'http_error', 'network_error', 'misconfigured', 'exception', 'db_error'].includes(g.finalStatus.kind)).length,
    noTokens: filtered.filter((g) => g.finalStatus.kind === 'no_tokens').length,
  }), [filtered]);

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Pokušaja</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">FCM uspjeh</p>
          <p className="text-lg font-bold text-emerald-600">{stats.success}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Greške</p>
          <p className="text-lg font-bold text-rose-600">{stats.failed}</p>
        </div>
        <div className="bg-card border rounded-lg p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Bez tokena</p>
          <p className="text-lg font-bold text-amber-600">{stats.noTokens}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Izvor funkcija" /></SelectTrigger>
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

      {/* Grouped attempts */}
      {loading && logs.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nema zapisa za odabrane filtere.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g) => {
            const isExpanded = expandedId === g.request_id;
            const tone = g.finalStatus.tone;
            const StatusIcon = tone === 'green' ? CheckCircle2 : tone === 'red' ? XCircle : tone === 'amber' ? AlertTriangle : HelpCircle;

            return (
              <div key={g.request_id} className="bg-card border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : g.request_id)}
                  className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon className={`w-4 h-4 shrink-0 mt-0.5 ${tone === 'green' ? 'text-emerald-500' : tone === 'red' ? 'text-rose-500' : tone === 'amber' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          {g.source_function || 'unknown'}
                        </Badge>
                        <Badge className={`text-[10px] h-5 px-1.5 border-0 ${TONE_CLASSES[tone]}`}>
                          {g.finalStatus.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(g.created_at), 'dd.MM. HH:mm:ss', { locale: hr })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{g.title || '(bez naslova)'}</p>
                      {g.finalStatus.detail && (
                        <p className={`text-xs ${tone === 'red' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'} line-clamp-2`}>
                          {g.finalStatus.detail}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>👤 {g.user_display_name || g.user_id?.substring(0, 8) || '—'}</span>
                        {/* Stage breadcrumb */}
                        <span className="inline-flex items-center gap-1">
                          {(['helper', 'send_push', 'fcm'] as const).map((stage, i) => {
                            const has = g.stages.some((s) => s.lifecycle_stage === stage);
                            return (
                              <span key={stage} className="inline-flex items-center gap-1">
                                {i > 0 && <span className="opacity-30">→</span>}
                                <span className={has ? 'text-foreground font-semibold' : 'opacity-30'}>
                                  {stage === 'helper' ? '①' : stage === 'send_push' ? '②' : '③'}
                                </span>
                              </span>
                            );
                          })}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/30 p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="uppercase font-semibold text-muted-foreground">Request ID</span>
                        <code className="block break-all">{g.request_id}</code>
                      </div>
                      <div>
                        <span className="uppercase font-semibold text-muted-foreground">User ID</span>
                        <code className="block break-all">{g.user_id || '—'}</code>
                      </div>
                    </div>

                    {/* Lifecycle stages */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground">Faze životnog ciklusa</p>
                      {g.stages.map((s) => {
                        const meta = STAGE_META[s.lifecycle_stage || ''] || { icon: HelpCircle, label: s.lifecycle_stage || '—' };
                        const StageIcon = meta.icon;
                        const isError = s.dispatch_status?.includes('error') || s.dispatch_status === 'fcm_all_failed' || s.dispatch_status === 'send_push_exception' || s.dispatch_status === 'send_push_misconfigured';
                        const isOk = s.dispatch_status === 'dispatch_ok' || s.dispatch_status === 'fcm_success';
                        return (
                          <div key={s.id} className="bg-background border rounded p-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <StageIcon className={`w-3.5 h-3.5 ${isOk ? 'text-emerald-500' : isError ? 'text-rose-500' : 'text-amber-500'}`} />
                              <span className="text-xs font-medium">{meta.label}</span>
                              <Badge variant="outline" className="text-[9px] h-4 px-1">
                                {s.dispatch_status || '—'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {format(new Date(s.created_at), 'HH:mm:ss.SSS')}
                                {s.duration_ms != null && ` · ${s.duration_ms}ms`}
                              </span>
                            </div>
                            {s.dispatch_error && (
                              <p className="text-[11px] text-rose-600 dark:text-rose-400">⚠ {s.dispatch_error}</p>
                            )}
                            {s.lifecycle_stage === 'fcm' && (
                              <p className="text-[11px] text-muted-foreground">
                                Tokena: {s.token_count} · Uspjeh: {s.success_count} · Greška: {s.failure_count}
                                {s.fcm_error_codes?.length ? ` · ${s.fcm_error_codes.join(', ')}` : ''}
                              </p>
                            )}
                            {s.send_push_http_status != null && (
                              <p className="text-[11px] text-muted-foreground">HTTP odgovor: {s.send_push_http_status}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Raw payloads */}
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Sirovi podaci (JSON)
                      </summary>
                      <div className="mt-2 space-y-2">
                        {g.stages.map((s) => (
                          <div key={`raw-${s.id}`}>
                            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                              {s.lifecycle_stage} → {s.dispatch_status}
                            </p>
                            <pre className="text-[10px] bg-background p-2 rounded border overflow-auto max-h-32">
{JSON.stringify({ request: s.request_payload, response: s.response_summary }, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </details>
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
