import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, User, Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

interface AlertRow {
  id: string;
  alert_signature: string;
  triggered_at: string;
  error_count: number;
  affected_users: number;
  sample_message: string | null;
  sample_route: string | null;
}

interface DiagnosticEvent {
  id: string;
  user_id: string | null;
  session_id: string;
  event: string;
  route: string | null;
  details: any;
  app_version: string | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
}

interface Props {
  alert: AlertRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIME_WINDOWS = [
  { value: '1', label: '1h' },
  { value: '6', label: '6h' },
  { value: '24', label: '24h' },
  { value: '72', label: '3d' },
];

export const PulseAlertDetailDialog = ({ alert, open, onOpenChange }: Props) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState<string>('24');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  useEffect(() => {
    if (!open || !alert) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, alert?.id, hours]);

  const load = async () => {
    if (!alert) return;
    setLoading(true);
    try {
      const sinceIso = new Date(Date.now() - Number(hours) * 60 * 60_000).toISOString();
      // Fetch error events in window
      const { data: rows } = await supabase
        .from('app_diagnostics_logs')
        .select('id, user_id, session_id, event, route, details, app_version, created_at')
        .in('event', ['window_error', 'unhandled_rejection'])
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500);

      const list = (rows ?? []) as DiagnosticEvent[];
      setEvents(list);

      // Resolve display names for users present in events
      const userIds = Array.from(
        new Set(list.map((e) => e.user_id).filter((u): u is string => !!u))
      );
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        const map: Record<string, string> = {};
        for (const p of (profs ?? []) as ProfileRow[]) {
          map[p.user_id] = p.display_name ?? p.user_id.slice(0, 8);
        }
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } finally {
      setLoading(false);
    }
  };

  // Build user options grouped by error count
  const userOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      const k = e.user_id ?? '__anon__';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        id,
        label:
          id === '__anon__'
            ? t('admin.pulse.anonUser', 'Anonimni')
            : profiles[id] ?? id.slice(0, 8),
        count,
      }));
  }, [events, profiles, t]);

  // Filter events by selected user
  const filteredEvents = useMemo(() => {
    if (selectedUser === 'all') return events;
    if (selectedUser === '__anon__') return events.filter((e) => !e.user_id);
    return events.filter((e) => e.user_id === selectedUser);
  }, [events, selectedUser]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            {t('admin.pulse.alertDetailTitle', 'Detalji alarma')}
          </DialogTitle>
        </DialogHeader>

        {alert && (
          <div className="space-y-3">
            {/* Alert summary */}
            <div className="bg-muted/40 border rounded-lg p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {alert.error_count} {t('admin.pulse.errorsLabel', 'grešaka')}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {alert.affected_users} {t('admin.pulse.usersLabel', 'korisnika')}
                </Badge>
                {alert.sample_route && (
                  <Badge variant="outline" className="text-[10px]">
                    {alert.sample_route}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {format(new Date(alert.triggered_at), 'dd.MM.yyyy HH:mm')}
                </span>
              </div>
              {alert.sample_message && (
                <div className="text-xs text-foreground font-mono break-words">
                  {alert.sample_message}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[140px]">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                  {t('admin.pulse.timeWindow', 'Vremenski prozor')}
                </label>
                <Select value={hours} onValueChange={setHours}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_WINDOWS.map((w) => (
                      <SelectItem key={w.value} value={w.value} className="text-xs">
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">
                  {t('admin.pulse.userFilter', 'Korisnik')}
                </label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      {t('admin.pulse.allUsers', 'Svi korisnici')} ({events.length})
                    </SelectItem>
                    {userOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.label} ({u.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Events list */}
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {t('admin.pulse.noEventsForUser', 'Nema eventova za odabrane filtere.')}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {t('admin.pulse.eventsCount', 'Eventovi')} ({filteredEvents.length})
                </div>
                {filteredEvents.map((ev) => {
                  const message =
                    ev.details?.message ?? ev.details?.reason ?? t('admin.pulse.noMessage', '(bez poruke)');
                  const stack: string | undefined = ev.details?.stack;
                  const userLabel = ev.user_id
                    ? profiles[ev.user_id] ?? ev.user_id.slice(0, 8)
                    : t('admin.pulse.anonUser', 'Anonimni');

                  return (
                    <div
                      key={ev.id}
                      className="border rounded-lg p-2.5 space-y-1.5 bg-background/50"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 bg-destructive/15 text-destructive border-destructive/30"
                        >
                          {ev.event}
                        </Badge>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <User className="w-2.5 h-2.5" />
                          {userLabel}
                        </span>
                        {ev.route && (
                          <code className="text-foreground bg-muted px-1 rounded">
                            {ev.route}
                          </code>
                        )}
                        {ev.app_version && (
                          <span className="text-muted-foreground">v{ev.app_version}</span>
                        )}
                        <span className="text-muted-foreground ml-auto">
                          {format(new Date(ev.created_at), 'dd.MM HH:mm:ss')}
                        </span>
                      </div>
                      <div className="text-xs text-foreground font-mono break-words">
                        {String(message).slice(0, 300)}
                      </div>
                      {stack && (
                        <details className="text-[10px]">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                            <Code2 className="w-3 h-3" />
                            {t('admin.pulse.stackTrace', 'Stack trace')}
                          </summary>
                          <pre className="mt-1 p-2 bg-muted/60 rounded overflow-x-auto whitespace-pre-wrap break-all text-foreground/80">
                            {stack}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
