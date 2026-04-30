import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Loader2, RefreshCw, AlertTriangle, BellRing, ChevronRight } from 'lucide-react';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { tr, friendlyError } from '@/lib/errorMessages';
import { PulseAlertDetailDialog } from './PulseAlertDetailDialog';

interface AlertRow {
  id: string;
  alert_signature: string;
  triggered_at: string;
  error_count: number;
  affected_users: number;
  sample_message: string | null;
  sample_route: string | null;
  notified: boolean;
}

export const PulseAlertsSection = () => {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('monitor_alerts_log')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(20);
    setAlerts((data as AlertRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const triggerScan = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('monitor-app-health', { body: {} });
      if (error) throw error;
      showSuccess(t('admin.pulse.scanDone', 'Skeniranje izvršeno'));
      await load();
    } catch (e: any) {
      showError(friendlyError(e));
    }
    setRunning(false);
  };

  return (
    <div className="bg-card border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <BellRing className="w-3.5 h-3.5" />
          <span>{t('admin.pulse.alertsTitle', 'Alarmi')}</span>
        </div>
        <Button size="sm" variant="outline" onClick={triggerScan} disabled={running} className="h-7 text-xs">
          {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          {t('admin.pulse.scanNow', 'Skeniraj sada')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          {t('admin.pulse.alertsEmpty', 'Nema aktivnih alarma. ✅')}
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setSelectedAlert(a);
                setDetailOpen(true);
              }}
              className="w-full text-left border rounded-lg p-2.5 space-y-1.5 bg-background/50 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-semibold">
                    {a.error_count} {t('admin.pulse.errorsLabel', 'grešaka')} · {a.affected_users} {t('admin.pulse.usersLabel', 'korisnika')}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.notified && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                      ✓ {t('admin.pulse.notified', 'Push poslan')}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(a.triggered_at), 'dd.MM HH:mm')}
                  </span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
              </div>
              {a.sample_route && (
                <div className="text-[10px] text-muted-foreground">
                  {t('admin.pulse.routeLabel', 'Ruta')}: <code className="text-foreground">{a.sample_route}</code>
                </div>
              )}
              {a.sample_message && (
                <div className="text-xs text-foreground truncate" title={a.sample_message}>
                  {a.sample_message}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <PulseAlertDetailDialog
        alert={selectedAlert}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
};
