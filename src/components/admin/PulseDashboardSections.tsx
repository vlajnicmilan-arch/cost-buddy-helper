import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { BarChart3, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SectionRow {
  section: string;
  views: number;
  clicks: number;
  unique_users: number;
}
interface ScrollRow {
  depth: number;
  hits: number;
  unique_users: number;
}

const SECTION_LABELS: Record<string, string> = {
  projects_hero: 'Hero: Projekti',
  projects_strip: 'Strip: Projekti (V1)',
  payment_sources: 'Izvori plaćanja',
  summary: 'Sažetak prihoda/rashoda',
  ai_insights: 'AI uvidi',
  transactions: 'Zadnje transakcije',
};

export const PulseDashboardSections = () => {
  const { t } = useTranslation();
  const [rangeDays, setRangeDays] = useState(14);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [scroll, setScroll] = useState<ScrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [secRes, scrRes] = await Promise.all([
          supabase.rpc('get_dashboard_section_stats', { p_days: rangeDays }),
          supabase.rpc('get_dashboard_scroll_distribution', { p_days: rangeDays }),
        ]);
        if (cancelled) return;
        if (secRes.error) throw secRes.error;
        if (scrRes.error) throw scrRes.error;
        setSections((secRes.data as SectionRow[]) ?? []);
        setScroll((scrRes.data as ScrollRow[]) ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const maxViews = Math.max(1, ...sections.map((s) => s.views));
  const topScroll = scroll.find((s) => s.depth === 25)?.hits ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          {t('admin.dashboardSections.title', 'Dashboard sekcije — view/click')}
        </h4>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 dana</SelectItem>
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
      ) : sections.length === 0 && !loading ? (
        <div className="text-xs text-muted-foreground py-3 text-center">
          {t('admin.dashboardSections.empty', 'Nema podataka za odabrani period.')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sections.map((s) => {
            const widthPct = (s.views / maxViews) * 100;
            const ctr = s.views > 0 ? Math.round((s.clicks / s.views) * 100) : 0;
            return (
              <div key={s.section} className="rounded-lg border border-border/40 overflow-hidden relative" style={{ minHeight: 44 }}>
                <div
                  className="absolute inset-y-0 left-0 transition-all"
                  style={{
                    width: `${Math.max(widthPct, 4)}%`,
                    background: 'linear-gradient(90deg, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.06))',
                    borderRight: '2px solid hsl(var(--primary))',
                  }}
                />
                <div className="relative flex items-center justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight truncate">
                      {SECTION_LABELS[s.section] ?? s.section}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {s.unique_users} {t('admin.dashboardSections.uniqueUsers', 'jedinstvenih korisnika')} · CTR {ctr}%
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold tabular-nums leading-tight">{s.views}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {s.clicks} {t('admin.dashboardSections.clicks', 'klikova')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scroll.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
            {t('admin.dashboardSections.scrollDepth', 'Dubina scrollanja')}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[25, 50, 75, 100].map((d) => {
              const row = scroll.find((s) => s.depth === d);
              const hits = row?.hits ?? 0;
              const pct = topScroll > 0 ? Math.round((hits / topScroll) * 100) : 0;
              return (
                <div key={d} className="rounded-lg border border-border/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">{d}%</p>
                  <p className="text-sm font-bold tabular-nums">{hits}</p>
                  <p className="text-[9px] text-muted-foreground">{pct}% od 25%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">
        {t(
          'admin.dashboardSections.hint',
          'View = dedupliciran po sesiji × sekciji. Scroll = jedan event po pragu po sesiji. Razdoblje: zadnjih {{days}} dana.',
          { days: rangeDays }
        )}
      </div>
    </motion.div>
  );
};
