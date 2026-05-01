import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isWeekend, isSameMonth,
} from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Users, Loader2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExportButton } from '@/components/ui/export-button';
import { useProjectWorkLogs } from '@/hooks/useProjectWorkLogs';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { exportFile, type ExportMode } from '@/lib/fileExport';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { cn } from '@/lib/utils';
import type { WorkLogDayType } from '@/types/projectWorkLog';

interface WorkLogMonthlyOverviewProps {
  projectId: string;
  projectName: string;
}

interface CellData {
  hours: number;
  dayType?: WorkLogDayType;
}

const dayTypeLabel = (t: any, dt: WorkLogDayType): string => {
  switch (dt) {
    case 'vacation': return t('workLog.dayTypeShort.vacation', 'GO');
    case 'sick': return t('workLog.dayTypeShort.sick', 'B');
    case 'holiday': return t('workLog.dayTypeShort.holiday', 'P');
    case 'weekend': return t('workLog.dayTypeShort.weekend', '–');
    default: return '';
  }
};

const dayTypeBadgeClass = (dt?: WorkLogDayType): string => {
  switch (dt) {
    case 'vacation': return 'bg-amber-500/20 text-amber-700 dark:text-amber-300';
    case 'sick': return 'bg-rose-500/20 text-rose-700 dark:text-rose-300';
    case 'holiday': return 'bg-violet-500/20 text-violet-700 dark:text-violet-300';
    case 'weekend': return 'bg-muted text-muted-foreground';
    default: return '';
  }
};

export const WorkLogMonthlyOverview = ({ projectId, projectName }: WorkLogMonthlyOverviewProps) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'de' ? de : i18n.language === 'en' ? enUS : hr;

  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [exporting, setExporting] = useState(false);

  const { logs, loading: logsLoading } = useProjectWorkLogs(projectId);
  const { workers, loading: workersLoading } = useProjectWorkers(projectId);

  const loading = logsLoading || workersLoading;

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  // Per-author day_type map (for absence column display)
  // Key: `${user_id}|${log_date}`
  const authorDayMap = useMemo(() => {
    const m = new Map<string, WorkLogDayType>();
    logs.forEach((l) => {
      if (!isSameMonth(new Date(l.log_date), currentMonth)) return;
      m.set(`${l.user_id}|${l.log_date}`, (l.day_type as WorkLogDayType) || 'work');
    });
    return m;
  }, [logs, currentMonth]);

  // Worker hours per day from project_work_entries via useProjectWorkers... we already have workers.
  // We need actual entries per worker per day. Re-fetch via hook? Simpler: derive from logs hoursByDate?
  // Better: query directly. For now, reuse monthly via workers + entries from useProjectWorkers internal.
  // But useProjectWorkers exposes only totals. We'll fetch entries via a small inline state.

  // Use hoursByDate from useProjectWorkLogs
  const { hoursByDate } = useProjectWorkLogs(projectId);

  const grid = useMemo(() => {
    // worker_id -> date -> hours
    const map = new Map<string, Map<string, number>>();
    Object.entries(hoursByDate).forEach(([date, summaries]) => {
      if (!isSameMonth(new Date(date), currentMonth)) return;
      summaries.forEach((s) => {
        if (!map.has(s.worker_id)) map.set(s.worker_id, new Map());
        map.get(s.worker_id)!.set(date, (map.get(s.worker_id)!.get(date) || 0) + s.actual_hours);
      });
    });
    return map;
  }, [hoursByDate, currentMonth]);

  const workerTotals = useMemo(() => {
    const totals = new Map<string, number>();
    grid.forEach((dayMap, wid) => {
      let sum = 0;
      dayMap.forEach((h) => sum += h);
      totals.set(wid, sum);
    });
    return totals;
  }, [grid]);

  const grandTotal = useMemo(() => {
    let sum = 0;
    workerTotals.forEach((h) => sum += h);
    return sum;
  }, [workerTotals]);

  // Workers visible: those with hours OR all workers (show all so manager sees zeros)
  const visibleWorkers = workers;

  const monthLabel = format(currentMonth, 'LLLL yyyy.', { locale: dateLocale });

  const handleExportCsv = async (mode: ExportMode) => {
    setExporting(true);
    try {
      const lines: string[] = [];
      lines.push(`${t('workLog.export.project', 'Projekt')};${projectName}`);
      lines.push(`${t('workLog.export.month', 'Mjesec')};${monthLabel}`);
      lines.push('');
      // Header row
      const header = [t('workLog.export.worker', 'Radnik')];
      days.forEach((d) => header.push(format(d, 'd.M.')));
      header.push(t('workLog.export.total', 'Ukupno (h)'));
      lines.push(header.join(';'));
      // Body
      visibleWorkers.forEach((w) => {
        const row: string[] = [`${w.first_name} ${w.last_name}`];
        const dayMap = grid.get(w.id);
        days.forEach((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const h = dayMap?.get(key) || 0;
          row.push(h > 0 ? h.toFixed(2).replace('.', ',') : '');
        });
        row.push((workerTotals.get(w.id) || 0).toFixed(2).replace('.', ','));
        lines.push(row.join(';'));
      });
      lines.push('');
      lines.push(`${t('workLog.export.grandTotal', 'Sveukupno')};${grandTotal.toFixed(2).replace('.', ',')}`);

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `dnevnik-rada-${format(currentMonth, 'yyyy-MM')}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      await exportFile(blob, filename, mode);
      showSuccess(t('workLog.export.done', 'Izvoz završen'));
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async (mode: ExportMode) => {
    setExporting(true);
    try {
      const { jsPDF } = await loadJsPdf();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.text(t('workLog.export.title', 'Mjesečni pregled rada'), 14, 15);
      doc.setFontSize(10);
      doc.text(`${t('workLog.export.project', 'Projekt')}: ${projectName}`, 14, 22);
      doc.text(`${t('workLog.export.month', 'Mjesec')}: ${monthLabel}`, 14, 28);

      // Build table data
      const head = [[t('workLog.export.worker', 'Radnik'), ...days.map((d) => format(d, 'd')), t('workLog.export.total', 'Σ')]];
      const body = visibleWorkers.map((w) => {
        const row: (string | number)[] = [`${w.first_name} ${w.last_name}`];
        const dayMap = grid.get(w.id);
        days.forEach((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const h = dayMap?.get(key) || 0;
          row.push(h > 0 ? h.toFixed(1) : '');
        });
        row.push((workerTotals.get(w.id) || 0).toFixed(1));
        return row;
      });

      // Lazy-load autotable
      const autoTable = (await import('jspdf-autotable')).default;
      autoTable(doc, {
        startY: 34,
        head,
        body,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [30, 130, 130] },
        columnStyles: {
          0: { cellWidth: 36 },
          [days.length + 1]: { fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          // Highlight weekends in header
          if (data.section === 'head' && data.column.index > 0 && data.column.index <= days.length) {
            const d = days[data.column.index - 1];
            if (isWeekend(d)) {
              data.cell.styles.fillColor = [80, 80, 80];
            }
          }
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 40;
      doc.setFontSize(10);
      doc.text(`${t('workLog.export.grandTotal', 'Sveukupno')}: ${grandTotal.toFixed(2)} h`, 14, finalY + 8);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(t('workLog.export.note', 'Interni dokument — nije službena evidencija radnog vremena.'), 14, finalY + 14);

      const blob = doc.output('blob');
      const filename = `dnevnik-rada-${format(currentMonth, 'yyyy-MM')}.pdf`;
      await exportFile({
        filename,
        data: blob,
        mimeType: 'application/pdf',
        mode,
      });
      showSuccess(t('workLog.export.done', 'Izvoz završen'));
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              aria-label={t('common.previous', 'Prethodno')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm capitalize min-w-[120px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              aria-label={t('common.next', 'Sljedeće')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <ExportButton
              label="CSV"
              compact
              disabled={exporting || visibleWorkers.length === 0}
              onExport={handleExportCsv}
            />
            <ExportButton
              label="PDF"
              icon={<FileText className="w-4 h-4 mr-1" />}
              compact
              disabled={exporting || visibleWorkers.length === 0}
              onExport={handleExportPdf}
            />
          </div>
        </div>

        {/* Total */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>
            {t('workLog.monthly.totalLabel', 'Ukupno radnika')}: <strong className="text-foreground">{visibleWorkers.length}</strong>
          </span>
          <span>·</span>
          <span>
            {t('workLog.monthly.totalHours', 'Sati u mjesecu')}: <strong className="text-foreground">{grandTotal.toFixed(1)}h</strong>
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleWorkers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t('workLog.monthly.noWorkers', 'Nema radnika na projektu.')}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-1.5 sticky left-0 bg-card z-10 min-w-[110px]">
                    {t('workLog.monthly.worker', 'Radnik')}
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={cn(
                        'p-1 text-center min-w-[24px] font-normal',
                        isWeekend(d) && 'bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <div className="text-[10px]">{format(d, 'EEEEEE', { locale: dateLocale })}</div>
                      <div className="font-semibold">{format(d, 'd')}</div>
                    </th>
                  ))}
                  <th className="p-1.5 text-center bg-primary/10 font-bold min-w-[40px]">Σ</th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkers.map((w) => {
                  const dayMap = grid.get(w.id);
                  const total = workerTotals.get(w.id) || 0;
                  return (
                    <tr key={w.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="p-1.5 sticky left-0 bg-card z-10 font-medium">
                        {w.first_name} {w.last_name}
                      </td>
                      {days.map((d) => {
                        const key = format(d, 'yyyy-MM-dd');
                        const h = dayMap?.get(key) || 0;
                        // Use day_type for the worker if their user_id maps; fallback to weekend dim
                        const userKey = w.user_id ? `${w.user_id}|${key}` : null;
                        const dt = userKey ? authorDayMap.get(userKey) : undefined;
                        const isAbsence = dt && dt !== 'work' && dt !== 'weekend';
                        return (
                          <td
                            key={key}
                            className={cn(
                              'p-1 text-center',
                              isWeekend(d) && !h && 'bg-muted/30',
                            )}
                          >
                            {h > 0 ? (
                              <span className="font-medium">{h.toFixed(1)}</span>
                            ) : isAbsence ? (
                              <Badge variant="secondary" className={cn('px-1 py-0 text-[9px] h-4', dayTypeBadgeClass(dt))}>
                                {dayTypeLabel(t, dt!)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground/40">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-1.5 text-center bg-primary/5 font-bold">
                        {total > 0 ? total.toFixed(1) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap pt-1 border-t border-border/40">
          <span className="font-medium">{t('workLog.monthly.legend', 'Legenda')}:</span>
          <Badge variant="secondary" className={cn('px-1 py-0 text-[9px] h-4', dayTypeBadgeClass('vacation'))}>GO</Badge>
          <span>{t('workLog.dayType.vacation', 'Godišnji')}</span>
          <Badge variant="secondary" className={cn('px-1 py-0 text-[9px] h-4', dayTypeBadgeClass('sick'))}>B</Badge>
          <span>{t('workLog.dayType.sick', 'Bolovanje')}</span>
          <Badge variant="secondary" className={cn('px-1 py-0 text-[9px] h-4', dayTypeBadgeClass('holiday'))}>P</Badge>
          <span>{t('workLog.dayType.holiday', 'Praznik')}</span>
        </div>
      </CardContent>
    </Card>
  );
};
