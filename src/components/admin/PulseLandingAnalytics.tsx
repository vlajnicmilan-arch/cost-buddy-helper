import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MousePointerClick, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EventRow {
  event_type: string;
  target: string;
  hits: number;
  unique_sessions: number;
}
interface Overview {
  sessions: number;
  page_views: number;
  cta_sessions: number;
  scroll50_sessions: number;
  scroll100_sessions: number;
  median_seconds: number;
}

const GROUPS: Array<{ key: string; label: string }> = [
  { key: 'cta_click', label: 'Klikovi na CTA' },
  { key: 'section_view', label: 'Viđene sekcije' },
  { key: 'link_click', label: 'Ostale poveznice' },
  { key: 'lang_change', label: 'Promjena jezika' },
  { key: 'theme_change', label: 'Promjena teme' },
];

export const PulseLandingAnalytics = () => {
  const { t } = useTranslation();
  const [rangeDays, setRangeDays] = useState(7);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, ovRes] = await Promise.all([
          supabase.rpc('get_landing_event_stats' as any, { p_days: rangeDays }),
          supabase.rpc('get_landing_overview' as any, { p_days: rangeDays }),
        ]);
        if (cancelled) return;
        if (statsRes.error) throw statsRes.error;
        if (ovRes.error) throw ovRes.error;
        setRows((statsRes.data as EventRow[]) ?? []);
        const ov = (ovRes.data as Overview[] | Overview | null);
        setOverview(Array.isArray(ov) ? ov[0] ?? null : ov);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const sessions = overview?.sessions ?? 0;
  const pct = (n: number) => (sessions > 0 ? Math.round((n / sessions) * 100) : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-primary" />
          {t('admin.landingAnalytics.title', 'Prodajna stranica — ponašanje posjetitelja')}
        </h4>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 dan</SelectItem>
              <SelectItem value="7">7 dana</SelectItem>
              <SelectItem value="14">14 dana</SelectItem>
              <SelectItem value="30">30 dana</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[10px] text-muted-foreground">Sesije</p>
              <p className="text-base font-bold tabular-nums">{sessions}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[10px] text-muted-foreground">Klik na CTA</p>
              <p className="text-base font-bold tabular-nums">{overview?.cta_sessions ?? 0}</p>
              <p className="text-[9px] text-muted-foreground">{pct(overview?.cta_sessions ?? 0)}% sesija</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[10px] text-muted-foreground">Skrol ≥50%</p>
              <p className="text-base font-bold tabular-nums">{overview?.scroll50_sessions ?? 0}</p>
              <p className="text-[9px] text-muted-foreground">do kraja: {overview?.scroll100_sessions ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-[10px] text-muted-foreground">Medijan vremena</p>
              <p className="text-base font-bold tabular-nums">{overview?.median_seconds ?? 0}s</p>
            </div>
          </div>

          {rows.length === 0 && !loading ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              {t('admin.landingAnalytics.empty', 'Nema podataka za odabrani period.')}
            </div>
          ) : (
            <div className="space-y-3">
              {GROUPS.map((g) => {
                const group = rows.filter((r) => r.event_type === g.key).slice(0, 12);
                if (group.length === 0) return null;
                const max = Math.max(1, ...group.map((r) => r.unique_sessions));
                return (
                  <div key={g.key}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{g.label}</p>
                    <div className="space-y-1">
                      {group.map((r) => (
                        <div
                          key={`${r.event_type}:${r.target}`}
                          className="rounded-lg border border-border/40 overflow-hidden relative"
                          style={{ minHeight: 34 }}
                        >
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${Math.max((r.unique_sessions / max) * 100, 4)}%`,
                              background: 'linear-gradient(90deg, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.06))',
                              borderRight: '2px solid hsl(var(--primary))',
                            }}
                          />
                          <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5">
                            <p className="text-xs font-medium truncate">{r.target || '—'}</p>
                            <p className="text-xs tabular-nums shrink-0">
                              {r.unique_sessions}
                              <span className="text-[10px] text-muted-foreground"> / {r.hits}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">
        {t(
          'admin.landingAnalytics.hint',
          'Brojke su jedinstvene sesije / ukupni događaji. Posjetitelji su anonimni (bez prijave). Razdoblje: zadnjih {{days}} dana.',
          { days: rangeDays },
        )}
      </div>
    </motion.div>
  );
};
