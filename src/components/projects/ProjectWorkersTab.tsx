import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { ProjectWorker, ProjectWorkEntry } from '@/types/projectWorker';
import { ProjectWorkerDialog } from './ProjectWorkerDialog';
import { WorkerScheduleDialog } from './WorkerScheduleDialog';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, User, Clock, Banknote, Loader2, CalendarDays, List, Download, FileText, FileSpreadsheet, FileJson, Search, Filter } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WorkCalendarOverview } from './WorkCalendarOverview';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';
import { supabase } from '@/integrations/supabase/client';
import { generateWorkRecordsPDF, generateWorkRecordsCSV, generateWorkRecordsJSON, WorkExportConfig } from '@/lib/workRecordsExport';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';

type PeriodKey = 'currentMonth' | 'previousMonth' | 'last30' | 'last90' | 'thisYear' | 'allTime' | 'custom';
type SortKey = 'name' | 'position' | 'hourlyRate' | 'periodHours' | 'periodCost';

function getPeriodRange(period: PeriodKey, customFrom?: string, customTo?: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (period) {
    case 'currentMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case 'previousMonth':
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'last30':
      return { start: startOfDay(new Date(now.getTime() - 30 * 86400000)), end: new Date(now.getTime() + 86400000) };
    case 'last90':
      return { start: startOfDay(new Date(now.getTime() - 90 * 86400000)), end: new Date(now.getTime() + 86400000) };
    case 'thisYear':
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
    case 'allTime':
      return { start: null, end: null };
    case 'custom':
      return {
        start: customFrom ? new Date(customFrom) : null,
        end: customTo ? new Date(new Date(customTo).getTime() + 86400000) : null,
      };
  }
}

interface ProjectWorkersTabProps {
  projectId: string;
  projectName?: string;
  isManager: boolean;
  loading?: boolean;
  onRefetch?: () => void;
}

export const ProjectWorkersTab = ({
  projectId,
  projectName = 'Projekt',
  isManager,
  loading: externalLoading,
  onRefetch
}: ProjectWorkersTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { workers, loading, addWorker, updateWorker, deleteWorker, totalCost, totalActualHours, refetch } = useProjectWorkers(projectId);
  const { milestones } = useProjectMilestones(projectId);
  const [viewMode, setViewMode] = useState<string>('list');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ProjectWorker | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState<string | null>(null);
  const [scheduleWorker, setScheduleWorker] = useState<ProjectWorker | null>(null);

  const handleExport = async (format: 'pdf' | 'csv' | 'json') => {
    try {
      const { data: entriesData, error } = await supabase
        .from('project_work_entries')
        .select('id, worker_id, work_date, scheduled_hours, actual_hours, note, milestone_ids')
        .eq('project_id', projectId);

      if (error) throw error;

      const entries = (entriesData || []).map(e => ({
        ...e,
        scheduled_hours: Number(e.scheduled_hours),
        actual_hours: Number(e.actual_hours),
      }));

      const config: WorkExportConfig = {
        workers: workers.map(w => ({
          id: w.id,
          first_name: w.first_name,
          last_name: w.last_name,
          position: w.position,
          hourly_rate: w.hourly_rate,
          work_start_time: w.work_start_time,
          work_end_time: w.work_end_time,
          actualHoursTotal: w.actualHoursTotal,
          actualCostTotal: w.actualCostTotal,
        })),
        entries,
        milestones: milestones.map(m => ({ id: m.id, name: m.name })),
        projectName,
        currency: currency ? { code: currency.code, symbol: currency.symbol, locale: currency.locale } : undefined,
      };

      if (format === 'pdf') await generateWorkRecordsPDF(config);
      else if (format === 'csv') await generateWorkRecordsCSV(config);
      else await generateWorkRecordsJSON(config);

      showSuccess(t('common.exported', 'Izvoz uspješan'));
    } catch (error) {
      console.error('Export error:', error);
      showError(t('common.error'));
    }
  };

  const handleAdd = () => {
    setEditingWorker(null);
    setDialogOpen(true);
  };

  const handleEdit = (worker: ProjectWorker) => {
    setEditingWorker(worker);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setWorkerToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (workerToDelete) {
      await deleteWorker(workerToDelete);
      setDeleteConfirmOpen(false);
      setWorkerToDelete(null);
      onRefetch?.();
    }
  };

  const handleSave = async (data: {
    first_name: string;
    last_name: string;
    position: string;
    work_hours: number;
    hourly_rate: number;
    work_start_time: string;
    work_end_time: string;
  }) => {
    if (editingWorker) {
      await updateWorker({ ...editingWorker, ...data });
    } else {
      await addWorker(data);
    }
    refetch();
    onRefetch?.();
  };

  const handleOpenSchedule = (worker: ProjectWorker) => {
    setScheduleWorker(worker);
  };

  if (loading || externalLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">{t('workers.title', 'Evidencija radnika')}</h3>
          <Badge variant="secondary">{workers.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {workers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-1" />
                  {t('common.export', 'Izvoz')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  <FileJson className="w-4 h-4 mr-2" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button onClick={handleAdd} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            {t('workers.add', 'Dodaj')}
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={setViewMode}>
        <TabsList className="w-full">
          <TabsTrigger value="list" className="flex-1 gap-1">
            <List className="w-4 h-4" />
            {t('workers.listView', 'Popis')}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex-1 gap-1">
            <CalendarDays className="w-4 h-4" />
            {t('workers.calendarView', 'Kalendar')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
          {/* Total cost summary */}
          {workers.length > 0 && (
            <Card className="p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">{t('workers.totalCost', 'Ukupni trošak rada')}:</span>
                  <span className="text-xs text-muted-foreground">{totalActualHours}h odrađeno</span>
                </div>
                <span className="text-lg font-bold text-primary">{formatAmount(totalCost)}</span>
              </div>
            </Card>
          )}

          {/* Workers list */}
          {workers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t('workers.noWorkers', 'Nema unesenih radnika')}</p>
              <p className="text-sm">{t('workers.noWorkersHint', 'Dodajte radnike za praćenje troškova rada')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workers.map((worker) => {
                return (
                  <Card key={worker.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">
                            {worker.first_name} {worker.last_name}
                          </h4>
                          <Badge variant="outline">{worker.position}</Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>
                              {worker.work_start_time?.slice(0, 5) || '08:00'} - {worker.work_end_time?.slice(0, 5) || '16:00'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Banknote className="w-4 h-4" />
                            <span>{formatAmount(worker.hourly_rate)}/{t('workers.hour', 'sat')}</span>
                          </div>
                        </div>

                        <div className="mt-2 text-sm font-medium">
                          {t('workers.workedHours', 'Odrađeno')}: {worker.actualHoursTotal}h = <span className="text-primary">{formatAmount(worker.actualCostTotal)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => handleOpenSchedule(worker)}
                          title={t('workers.openSchedule', 'Otvori raspored')}
                        >
                          <CalendarDays className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(worker)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {isManager && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(worker.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <WorkCalendarOverview projectId={projectId} milestones={milestones} />
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <ProjectWorkerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        worker={editingWorker}
        onSave={handleSave}
      />

      {/* Schedule Dialog */}
      {scheduleWorker && (
        <WorkerScheduleDialog
          open={!!scheduleWorker}
          onOpenChange={(open) => !open && setScheduleWorker(null)}
          worker={scheduleWorker}
          projectId={projectId}
          isManager={isManager}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workers.deleteConfirmTitle', 'Ukloni radnika?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workers.deleteConfirmMessage', 'Jeste li sigurni da želite ukloniti ovog radnika? Ova radnja se ne može poništiti.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
