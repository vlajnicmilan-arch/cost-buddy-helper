import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import {
  BookOpen, Plus, Pencil, Trash2, Loader2, Search,
  CloudSun, Target, Users, ClipboardList, MoreVertical, CalendarDays, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectWorkLogs } from '@/hooks/useProjectWorkLogs';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { useAuth } from '@/hooks/useAuth';
import { WorkLogDialog } from './WorkLogDialog';
import { WorkLogMonthlyOverview } from './WorkLogMonthlyOverview';
import { MyWorkerPayCard } from './MyWorkerPayCard';
import type { ProjectWorkLog } from '@/types/projectWorkLog';
import { useProjectWriteGuard } from '@/hooks/useProjectWriteGuard';

interface ProjectWorkLogTabProps {
  projectId: string;
  isManager: boolean;
  projectName?: string;
  isReadOnly?: boolean;
  /**
   * Role-based gate: true when caller is owner/member/worker and project
   * is not under owner-readonly downgrade. Decoupled from coarse isReadOnly,
   * which conflates subscription state with role-based write rights.
   */
  canLogOwnWork?: boolean;
}

type MonthFilter = 'current' | 'previous' | 'last3' | 'all';

export const ProjectWorkLogTab = ({ projectId, isManager, projectName, isReadOnly = false, canLogOwnWork = false }: ProjectWorkLogTabProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // Worklog-specific write gate: participant may write own work logs.
  // Owner-readonly (billing downgrade) still blocks via the isReadOnly flag
  // propagated through useProjectWriteGuard.
  const { guard, isReadOnly: worklogReadOnly } = useProjectWriteGuard({ isReadOnly, allowOwnWorkLog: canLogOwnWork });
  // Final per-action gate for own-work-log writes:
  // role must allow it AND worklog-specific guard must not be read-only
  // (owner-readonly billing gate still blocks).
  const canWorklog = canLogOwnWork && !worklogReadOnly;
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  const { logs, hoursByDate, loading, create, update, remove } = useProjectWorkLogs(projectId);
  const { milestones } = useProjectMilestones(projectId);
  const { workers } = useProjectWorkers(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<ProjectWorkLog | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filters
  const [monthFilter, setMonthFilter] = useState<MonthFilter>('current');
  const [milestoneFilter, setMilestoneFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'monthly'>('list');

  const isDateInPeriod = (dateStr: string, filter: MonthFilter): boolean => {
    if (filter === 'all') return true;
    const now = new Date();
    const startCurrent = startOfMonth(now);
    const startPrev = startOfMonth(subMonths(now, 1));
    const start3 = startOfMonth(subMonths(now, 2));
    const d = parseISO(dateStr);
    if (filter === 'current') return d >= startCurrent;
    if (filter === 'previous') return d >= startPrev && d < startCurrent;
    if (filter === 'last3') return d >= start3;
    return true;
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (!isDateInPeriod(l.log_date, monthFilter)) return false;
      // Milestone filter
      if (milestoneFilter !== 'all') {
        if (milestoneFilter === 'none' && l.milestone_id) return false;
        if (milestoneFilter !== 'none' && l.milestone_id !== milestoneFilter) return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${l.summary} ${l.notes || ''} ${l.user_name || ''} ${l.weather || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, monthFilter, milestoneFilter, searchQuery]);

  // My worker payout (only shown to non-managers who are linked as workers)
  const myWorker = useMemo(
    () => (user?.id ? workers.find((w) => w.user_id === user.id) : undefined),
    [workers, user?.id],
  );

  const myHoursInPeriod = useMemo(() => {
    if (!myWorker) return 0;
    let total = 0;
    Object.entries(hoursByDate).forEach(([date, entries]) => {
      if (!isDateInPeriod(date, monthFilter)) return;
      entries.forEach((e) => {
        if (e.worker_id === myWorker.id) total += e.actual_hours;
      });
    });
    return total;
  }, [myWorker, hoursByDate, monthFilter]);

  const periodLabelMap: Record<MonthFilter, string> = {
    current: t('workLog.filter.currentMonth', 'Tekući mjesec'),
    previous: t('workLog.filter.previousMonth', 'Prošli mjesec'),
    last3: t('workLog.filter.last3', 'Zadnja 3 mjeseca'),
    all: t('workLog.filter.all', 'Sve'),
  };


  const handleSubmit = async (input: any) => {
    if (!guard()) return false;
    if (editingLog) {
      return update(editingLog.id, input);
    }
    return create(input);
  };

  const openCreate = () => {
    if (!guard()) return;
    setEditingLog(null);
    setDialogOpen(true);
  };

  const openEdit = (log: ProjectWorkLog) => {
    if (!guard()) return;
    setEditingLog(log);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header — new entry button */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          {t('workLog.title', 'Dnevnik rada')}
          {view === 'list' && filteredLogs.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{filteredLogs.length}</Badge>
          )}
        </h3>
        <Button size="sm" onClick={openCreate} className="gap-1 rounded-xl" disabled={!canWorklog} title={!canWorklog ? t('projects.access.readOnlyBlockedToast') : undefined}>
          <Plus className="w-4 h-4" />
          {t('workLog.newEntry', 'Novi zapis')}
        </Button>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <Button
          variant={view === 'list' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => setView('list')}
        >
          <List className="w-3.5 h-3.5" />
          {t('workLog.viewList', 'Lista')}
        </Button>
        <Button
          variant={view === 'monthly' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => setView('monthly')}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {t('workLog.viewMonthly', 'Mjesečni pregled')}
        </Button>
      </div>

      {view === 'monthly' ? (
        <WorkLogMonthlyOverview projectId={projectId} projectName={projectName || t('workLog.title', 'Dnevnik rada')} />
      ) : (
      <>

      {/* My pay (worker linked to this project) */}
      {myWorker && !isManager && (
        <MyWorkerPayCard
          hourlyRate={myWorker.hourly_rate}
          hours={myHoursInPeriod}
          periodLabel={periodLabelMap[monthFilter]}
        />
      )}

      {/* Filters */}
      <div className="space-y-2">

        <div className="grid grid-cols-2 gap-2">
          <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v as MonthFilter)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[60]">
              <SelectItem value="current">{t('workLog.filter.currentMonth', 'Tekući mjesec')}</SelectItem>
              <SelectItem value="previous">{t('workLog.filter.previousMonth', 'Prošli mjesec')}</SelectItem>
              <SelectItem value="last3">{t('workLog.filter.last3', 'Zadnja 3 mjeseca')}</SelectItem>
              <SelectItem value="all">{t('workLog.filter.all', 'Sve')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={milestoneFilter} onValueChange={setMilestoneFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[60]">
              <SelectItem value="all">{t('workLog.filter.allPhases', 'Sve faze')}</SelectItem>
              <SelectItem value="none">{t('workLog.noMilestone', 'Bez faze')}</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('workLog.searchPlaceholder', 'Pretraga: opis, autor...')}
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              {logs.length === 0
                ? t('workLog.empty', 'Još nema zapisa u dnevniku rada')
                : t('workLog.emptyFiltered', 'Nema zapisa za odabrane filtere')}
            </p>
            {logs.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t('workLog.emptyHint', 'Klikni "Novi zapis" da započneš kronologiju projekta.')}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const dayHours = hoursByDate[log.log_date] || [];
            const totalHours = dayHours.reduce((s, h) => s + h.actual_hours, 0);
            const dayDate = parseISO(log.log_date);
            const isAuthor = log.user_id === user?.id;
            // Own-log edit/delete uses role-based gate; cross-log delete needs full owner write.
            const canEdit = isAuthor && canLogOwnWork && !isReadOnly;
            const canDelete = (isAuthor && canLogOwnWork && !isReadOnly) || (isManager && !isReadOnly);

            return (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-2.5">
                  {/* Date row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">
                        {format(dayDate, 'EEE, d. MMM yyyy.', { locale: dateLocale })}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                        {log.weather && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CloudSun className="w-3 h-3" />
                            {log.weather}
                          </span>
                        )}
                        {log.milestone_name && (
                          <span className="inline-flex items-center gap-1 text-xs text-primary">
                            <Target className="w-3 h-3" />
                            {log.milestone_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[60]">
                          {canEdit && (
                            <DropdownMenuItem onClick={() => openEdit(log)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              {t('common.edit', 'Uredi')}
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem onClick={() => setDeleteId(log.id)} className="text-destructive">
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              {t('common.delete', 'Obriši')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Summary */}
                  <p className="text-sm whitespace-pre-wrap break-words">{log.summary}</p>

                  {/* Auto worker hours */}
                  {dayHours.length > 0 && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                      <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground/80 mb-0.5">
                          {t('workLog.autoHours', 'Sati radnika za taj dan')} · {totalHours.toFixed(1)}h
                        </p>
                        <p className="break-words">
                          {dayHours.map((h, i) => (
                            <span key={h.worker_id}>
                              {i > 0 && ' · '}
                              {h.worker_name} ({h.actual_hours.toFixed(1)}h)
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {log.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-warning/5 rounded-md p-2 border border-warning/20">
                      <ClipboardList className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <p className="whitespace-pre-wrap break-words flex-1 min-w-0">{log.notes}</p>
                    </div>
                  )}

                  {/* Author */}
                  <p className="text-[11px] text-muted-foreground/80 pt-1 border-t border-border/30">
                    {t('workLog.by', 'Zabilježio')}:{' '}
                    <span className="font-medium">{log.user_name || t('common.user', 'Korisnik')}</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Create/Edit dialog */}
      <WorkLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        milestones={milestones}
        log={editingLog}
        onSubmit={handleSubmit}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workLog.deleteTitle', 'Obriši zapis?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workLog.deleteDescription', 'Ova radnja je nepovratna.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!guard()) return;
                if (deleteId) {
                  await remove(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete', 'Obriši')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
