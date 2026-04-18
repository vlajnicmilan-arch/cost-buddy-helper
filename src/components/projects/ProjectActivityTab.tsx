import { useProjectActivity } from '@/hooks/useProjectActivity';
import { useTranslation } from 'react-i18next';
import { Loader2, Activity, Plus, Pencil, Trash2, CheckCircle2, FileText, Users, Target, Wallet } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';

interface ProjectActivityTabProps {
  projectId: string;
}

const ACTION_ICONS: Record<string, any> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  completed: CheckCircle2,
  expense_added: Wallet,
  milestone_added: Target,
  member_added: Users,
  document_added: FileText,
};

const ACTION_COLORS: Record<string, string> = {
  created: 'text-income',
  updated: 'text-primary',
  deleted: 'text-destructive',
  completed: 'text-income',
  expense_added: 'text-expense',
  milestone_added: 'text-primary',
  member_added: 'text-primary',
  document_added: 'text-muted-foreground',
};

export const ProjectActivityTab = ({ projectId }: ProjectActivityTabProps) => {
  const { t, i18n } = useTranslation();
  const { activities, loading } = useProjectActivity(projectId);
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Activity className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t('projects.activity.empty', 'Još nema aktivnosti na projektu')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const Icon = ACTION_ICONS[activity.action_type] || Activity;
        const colorClass = ACTION_COLORS[activity.action_type] || 'text-muted-foreground';

        return (
          <div
            key={activity.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
          >
            <div className={`w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0 ${colorClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.user_name || t('common.user', 'Korisnik')}</span>
                {' '}
                <span className="text-muted-foreground">{activity.action_description}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5" title={format(new Date(activity.created_at), 'PPpp', { locale: dateLocale })}>
                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: dateLocale })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
