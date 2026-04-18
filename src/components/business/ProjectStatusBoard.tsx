import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Activity, Pause, AlertTriangle, CheckCircle2, FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatusCounts {
  active: number;
  paused: number;
  overdue: number;
  completed: number;
  total: number;
}

export const ProjectStatusBoard = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [counts, setCounts] = useState<StatusCounts>({ active: 0, paused: 0, overdue: 0, completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!user) return;
      setLoading(true);
      try {
        let query = supabase
          .from('projects')
          .select('id, status, end_date, archived_at')
          .eq('user_id', user.id)
          .is('archived_at', null);

        if (activeBusinessProfileId) {
          query = query.eq('business_profile_id', activeBusinessProfileId);
        }

        const { data } = await query;
        const projects = (data || []) as any[];
        const now = new Date();

        const active = projects.filter(p => p.status === 'active').length;
        const paused = projects.filter(p => p.status === 'paused').length;
        const completed = projects.filter(p => p.status === 'completed').length;
        const overdue = projects.filter(p =>
          p.status !== 'completed' &&
          p.status !== 'cancelled' &&
          p.end_date &&
          new Date(p.end_date) < now
        ).length;

        setCounts({ active, paused, overdue, completed, total: projects.length });
      } catch (e) {
        console.error('Status board error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [user, activeBusinessProfileId]);

  if (loading || counts.total === 0) return null;

  const items = [
    { key: 'active', label: t('projects.status.active', 'Aktivni'), count: counts.active, icon: Activity, color: 'text-income', bg: 'bg-income/10' },
    { key: 'overdue', label: t('projects.status.overdue', 'Zakašnjeli'), count: counts.overdue, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { key: 'paused', label: t('projects.status.paused', 'Pauzirani'), count: counts.paused, icon: Pause, color: 'text-warning', bg: 'bg-warning/10' },
    { key: 'completed', label: t('projects.status.completed', 'Završeni'), count: counts.completed, icon: CheckCircle2, color: 'text-muted-foreground', bg: 'bg-muted' },
  ];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FolderKanban className="w-4 h-4" />
          {t('projects.statusBoard', 'Stanje projekata')}
          <Badge variant="secondary" className="ml-auto text-[10px]">{counts.total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-2 gap-2">
          {items.map((it) => (
            <div key={it.key} className={`p-2.5 rounded-lg ${it.bg} flex items-center gap-2`}>
              <div className={`w-7 h-7 rounded-full bg-background/60 flex items-center justify-center ${it.color}`}>
                <it.icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight">{it.label}</p>
                <p className={`text-base font-bold leading-tight ${it.color}`}>{it.count}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
