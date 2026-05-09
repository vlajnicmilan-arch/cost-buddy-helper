import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Lock, Calendar, Target, Camera, Wallet, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface PublicProjectData {
  project: {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    status: string;
    start_date?: string;
    end_date?: string;
    total_budget?: number;
  };
  milestones?: any[];
  financials?: { totalSpent: number; totalIncome: number; totalBudget: number } | null;
  photos?: any[];
  permissions: { show_financials: boolean; show_photos: boolean; show_milestones: boolean };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PublicProject = () => {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-public-project?token=${token}`, {
          headers: { Authorization: `Bearer ${PUB_KEY}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'unknown');
        } else {
          setData(json);
        }
      } catch (e: any) {
        setError(e?.message || 'fetch failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return <div className="min-h-dvh flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>;
  }

  if (error || !data) {
    const msg = error === 'expired' ? t('publicProject.linkExpired')
      : error === 'revoked' ? t('publicProject.linkRevoked')
      : t('publicProject.linkInvalid');
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-6 text-center">
        <Lock className="w-12 h-12 text-muted-foreground mb-3" />
        <h1 className="text-lg font-semibold mb-1">{t('publicProject.noAccess')}</h1>
        <p className="text-sm text-muted-foreground">{msg}</p>
      </div>
    );
  }

  const { project, milestones, financials, photos, permissions } = data;
  const completed = milestones?.filter(m => m.status === 'completed').length || 0;
  const total = milestones?.length || 0;
  const overallProgress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6 sticky top-0 z-10 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            {project.icon || '📁'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{project.name}</h1>
            {project.description && <p className="text-xs opacity-90 truncate">{project.description}</p>}
          </div>
          <Badge variant="secondary" className="shrink-0">{project.status}</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Project meta */}
        <div className="grid grid-cols-2 gap-3">
          {project.start_date && (
            <div className="p-3 rounded-lg border bg-card">
              <p className="text-xs text-muted-foreground">{t('publicProject.start')}</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(project.start_date), 'd. MMM yyyy', { locale: hr })}
              </p>
            </div>
          )}
          {project.end_date && (
            <div className="p-3 rounded-lg border bg-card">
              <p className="text-xs text-muted-foreground">{t('publicProject.deadline')}</p>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(project.end_date), 'd. MMM yyyy', { locale: hr })}
              </p>
            </div>
          )}
        </div>

        {/* Overall progress */}
        {permissions.show_milestones && total > 0 && (
          <div className="p-4 rounded-lg border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                {t('publicProject.progress')}
              </span>
              <span className="text-sm font-semibold">{t('publicProject.phasesCount', { completed, total })}</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        )}

        {/* Financials */}
        {permissions.show_financials && financials && (
          <div className="p-4 rounded-lg border bg-card space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              {t('publicProject.financials')}
            </h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{t('publicProject.budget')}</p>
                <p className="text-base font-bold">{financials.totalBudget.toFixed(0)} €</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('publicProject.spent')}</p>
                <p className="text-base font-bold text-expense">{financials.totalSpent.toFixed(0)} €</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('publicProject.received')}</p>
                <p className="text-base font-bold text-income">{financials.totalIncome.toFixed(0)} €</p>
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        {permissions.show_milestones && milestones && milestones.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              {t('publicProject.phases')}
            </h2>
            {milestones.map((m: any) => (
              <div key={m.id} className="p-3 rounded-lg border bg-card flex items-start gap-3">
                <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: m.color || '#3b82f6' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium truncate">{m.name}</h3>
                    <Badge
                      variant={m.status === 'completed' ? 'default' : m.status === 'overdue' ? 'destructive' : 'outline'}
                      className="text-[10px] h-4 px-1"
                    >
                      {m.status === 'completed' ? t('publicProject.statusCompleted') : m.status === 'in_progress' ? t('publicProject.statusInProgress') : m.status === 'overdue' ? t('publicProject.statusOverdue') : t('publicProject.statusWaiting')}
                    </Badge>
                  </div>
                  {m.description && <p className="text-xs text-muted-foreground mb-1">{m.description}</p>}
                  {m.due_date && (
                    <p className="text-[11px] text-muted-foreground">
                      {t('publicProject.deadlineLabel')}: {format(new Date(m.due_date), 'd. MMM', { locale: hr })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photos */}
        {permissions.show_photos && photos && photos.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              {t('publicProject.photoLog')}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((p: any) => (
                <div key={p.id} className="aspect-square rounded-lg overflow-hidden border bg-muted relative">
                  {p.url ? (
                    <img src={p.url} alt={p.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Camera className="w-6 h-6" /></div>
                  )}
                  {p.captured_at && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1">
                      {format(new Date(p.captured_at), 'd.M.yyyy', { locale: hr })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!permissions.show_milestones && !permissions.show_financials && !permissions.show_photos && (
          <div className="text-center text-muted-foreground py-12">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('publicProject.ownerNotChosen')}</p>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground pt-6 pb-4">
          {t('publicProject.readonlyFooter')}
        </p>
      </div>
    </div>
  );
};

export default PublicProject;
