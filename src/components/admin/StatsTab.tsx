import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AdminStats } from './types';

interface StatsTabProps {
  stats: AdminStats | null;
  loading: boolean;
  onRefresh: () => void;
}

const StatCard = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
  <div className="bg-card border rounded-xl p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-2xl font-bold">{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

export const StatsTab = ({ stats, loading, onRefresh }: StatsTabProps) => {
  const { t } = useTranslation();
  if (loading && !stats) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-center text-muted-foreground py-8">{t('admin.noData')}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Ukupno korisnika" value={stats.total_users} />
        <StatCard label="Aktivni (7 dana)" value={stats.active_users_7d} sub={`${stats.active_users_30d} u zadnjih 30 dana`} />
        <StatCard label="Ukupno transakcija" value={stats.total_expenses} sub={`${stats.expenses_7d} u zadnjih 7 dana`} />
        <StatCard label="Otvorene prijave" value={stats.open_bug_reports} />
        <StatCard label="Projekti" value={stats.total_projects} />
        <StatCard label="Budžeti" value={stats.total_budgets} />
        <StatCard label="Pozivnice" value={stats.total_referrals} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Osvježi
        </Button>
      </div>
    </>
  );
};
