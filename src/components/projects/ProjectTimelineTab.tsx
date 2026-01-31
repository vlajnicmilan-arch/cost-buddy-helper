import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { ProjectMilestone, MILESTONE_STATUS_LABELS } from '@/types/project';
import { format, differenceInDays, isAfter, isBefore, startOfDay, addDays } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  Loader2, Target, Calendar, AlertTriangle, CheckCircle2, Clock, PlayCircle 
} from 'lucide-react';

interface ProjectTimelineTabProps {
  projectId: string;
  milestones: ProjectMilestone[];
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  loading: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-income';
    case 'in_progress':
      return 'bg-primary';
    case 'overdue':
      return 'bg-destructive';
    default:
      return 'bg-muted-foreground';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'in_progress':
      return <PlayCircle className="w-4 h-4" />;
    case 'overdue':
      return <AlertTriangle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

export const ProjectTimelineTab = ({
  projectId,
  milestones,
  projectStartDate,
  projectEndDate,
  loading
}: ProjectTimelineTabProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();

  const locale = i18n.language === 'hr' ? hr : i18n.language === 'de' ? de : enUS;

  // Calculate timeline bounds
  const timelineBounds = useMemo(() => {
    const today = startOfDay(new Date());
    
    // Get all dates from milestones
    const dates: Date[] = [];
    
    milestones.forEach(m => {
      if (m.start_date) dates.push(new Date(m.start_date));
      if (m.due_date) dates.push(new Date(m.due_date));
    });
    
    if (projectStartDate) dates.push(new Date(projectStartDate));
    if (projectEndDate) dates.push(new Date(projectEndDate));
    
    // If no dates, use today ± 30 days
    if (dates.length === 0) {
      return {
        start: addDays(today, -7),
        end: addDays(today, 30),
        totalDays: 37
      };
    }
    
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Add some padding
    const start = addDays(minDate, -3);
    const end = addDays(maxDate, 7);
    const totalDays = differenceInDays(end, start) || 1;
    
    return { start, end, totalDays };
  }, [milestones, projectStartDate, projectEndDate]);

  // Calculate position and width for a milestone bar
  const getMilestoneBarStyle = (milestone: ProjectMilestone) => {
    const { start: timelineStart, totalDays } = timelineBounds;
    
    const mStart = milestone.start_date ? new Date(milestone.start_date) : new Date();
    const mEnd = milestone.due_date ? new Date(milestone.due_date) : addDays(mStart, 7);
    
    const startOffset = differenceInDays(mStart, timelineStart);
    const duration = Math.max(differenceInDays(mEnd, mStart), 1);
    
    const leftPercent = Math.max(0, (startOffset / totalDays) * 100);
    const widthPercent = Math.min((duration / totalDays) * 100, 100 - leftPercent);
    
    return {
      left: `${leftPercent}%`,
      width: `${Math.max(widthPercent, 3)}%` // Minimum 3% width for visibility
    };
  };

  // Generate month markers for the timeline header
  const monthMarkers = useMemo(() => {
    const markers: { label: string; position: number }[] = [];
    const { start, end, totalDays } = timelineBounds;
    
    let current = new Date(start);
    current.setDate(1); // Start of month
    
    while (isBefore(current, end)) {
      const offset = differenceInDays(current, start);
      if (offset >= 0) {
        markers.push({
          label: format(current, 'MMM yyyy', { locale }),
          position: (offset / totalDays) * 100
        });
      }
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return markers;
  }, [timelineBounds, locale]);

  // Today marker position
  const todayPosition = useMemo(() => {
    const today = startOfDay(new Date());
    const offset = differenceInDays(today, timelineBounds.start);
    const percent = (offset / timelineBounds.totalDays) * 100;
    return percent >= 0 && percent <= 100 ? percent : null;
  }, [timelineBounds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{t('projects.noMilestones')}</p>
        <p className="text-sm">{t('projects.addMilestonesToSeeTimeline', 'Dodajte faze za prikaz timeline-a')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-muted-foreground" />
          <span>{t('projects.pending', 'Na čekanju')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span>{t('projects.inProgress', 'U tijeku')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-income" />
          <span>{t('projects.completed', 'Završeno')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span>{t('projects.overdue', 'Zakašnjelo')}</span>
        </div>
      </div>

      {/* Timeline header with months */}
      <div className="relative h-8 border-b">
        {monthMarkers.map((marker, i) => (
          <div
            key={i}
            className="absolute top-0 text-xs text-muted-foreground whitespace-nowrap"
            style={{ left: `${marker.position}%` }}
          >
            <div className="h-8 border-l border-dashed border-muted" />
            <span className="absolute top-0 left-1">{marker.label}</span>
          </div>
        ))}
        
        {/* Today marker */}
        {todayPosition !== null && (
          <div 
            className="absolute top-0 h-full w-0.5 bg-destructive z-10"
            style={{ left: `${todayPosition}%` }}
          >
            <span className="absolute -top-4 -translate-x-1/2 text-[10px] text-destructive font-medium">
              {t('projects.today', 'Danas')}
            </span>
          </div>
        )}
      </div>

      {/* Gantt bars */}
      <div className="space-y-3">
        {milestones.map((milestone) => {
          const barStyle = getMilestoneBarStyle(milestone);
          
          return (
            <div key={milestone.id} className="space-y-1">
              {/* Milestone info row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("shrink-0", getStatusColor(milestone.status).replace('bg-', 'text-'))}>
                    {getStatusIcon(milestone.status)}
                  </span>
                  <span className="font-medium truncate">{milestone.name}</span>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {MILESTONE_STATUS_LABELS[milestone.status]}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground shrink-0">
                  {milestone.budget > 0 && (
                    <span className="font-medium text-primary">
                      {formatAmount(milestone.budget)}
                    </span>
                  )}
                </div>
              </div>

              {/* Timeline bar */}
              <div className="relative h-8 bg-muted/30 rounded overflow-hidden">
                {/* Milestone duration bar */}
                <div
                  className={cn(
                    "absolute top-0 h-full rounded transition-all",
                    getStatusColor(milestone.status),
                    "opacity-80"
                  )}
                  style={barStyle}
                />

                {/* Date labels inside the bar */}
                <div
                  className="absolute top-0 h-full flex items-center px-2 text-xs text-white font-medium overflow-hidden"
                  style={barStyle}
                >
                  {milestone.start_date && milestone.due_date && (
                    <span className="truncate">
                      {format(new Date(milestone.start_date), 'd. MMM', { locale })} - {format(new Date(milestone.due_date), 'd. MMM', { locale })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold">{milestones.length}</p>
          <p className="text-xs text-muted-foreground">{t('projects.totalMilestones', 'Ukupno faza')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-income">
            {milestones.filter(m => m.status === 'completed').length}
          </p>
          <p className="text-xs text-muted-foreground">{t('projects.completed')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">
            {milestones.filter(m => m.status === 'in_progress').length}
          </p>
          <p className="text-xs text-muted-foreground">{t('projects.inProgress')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-destructive">
            {milestones.filter(m => m.status === 'overdue').length}
          </p>
          <p className="text-xs text-muted-foreground">{t('projects.overdue')}</p>
        </div>
      </div>
    </div>
  );
};
