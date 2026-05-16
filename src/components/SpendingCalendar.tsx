import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, X, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/ui/export-button';
import { cn } from '@/lib/utils';
import { getCategoryInfo } from '@/types/expense';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { applyBrandFont, brandTableTheme, BRAND_TEAL, BRAND_TEAL_LIGHT } from '@/lib/pdfBranding';

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: Date;
  type: string;
  category: string;
  merchant_name?: string | null;
}

interface SpendingCalendarProps {
  expenses: Expense[];
}

export const SpendingCalendar = ({ expenses }: SpendingCalendarProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday = 0, Sunday = 6
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

  const dayNames = useMemo(() => {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    return days.map(d => t(`dashboard.calendar.${d}`, d.charAt(0).toUpperCase() + d.slice(1, 2)));
  }, [t]);

  const monthName = new Date(year, month).toLocaleDateString(
    t('locale', 'hr-HR') === 'hr-HR' ? 'hr-HR' : t('locale', 'en-US'),
    { month: 'long', year: 'numeric' }
  );

  // Aggregate expenses per day
  const dailyData = useMemo(() => {
    const map: Record<number, { expense: number; income: number; transactions: Expense[] }> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = { expense: 0, income: 0, transactions: [] };
    }

    expenses.forEach(e => {
      const d = e.date;
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (map[day]) {
          map[day].transactions.push(e);
          if (e.type === 'expense') map[day].expense += e.amount;
          else if (e.type === 'income') map[day].income += e.amount;
        }
      }
    });

    return map;
  }, [expenses, year, month, daysInMonth]);

  const maxDayExpense = useMemo(() => {
    return Math.max(...Object.values(dailyData).map(d => d.expense), 1);
  }, [dailyData]);

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const selectedDayData = selectedDay ? dailyData[selectedDay] : null;

  const toAscii = (text: string): string => text;

  const exportDayPDF = async (mode: ExportMode = 'save') => {
    if (!selectedDay || !selectedDayData || selectedDayData.transactions.length === 0) return;

    const dateStr = `${selectedDay}. ${monthName}`;
    const { jsPDF, autoTable } = await loadJsPdf();
    const doc = new jsPDF();
  applyBrandFont(doc);

    doc.setFontSize(18);
    doc.setFont('Inter', 'bold');
    doc.text(toAscii(t('dashboard.calendar.title', 'Kalendar potrosnje')), 14, 20);

    doc.setFontSize(12);
    doc.setFont('Inter', 'normal');
    doc.text(toAscii(dateStr), 14, 28);

    const tableData = selectedDayData.transactions.map(tx => {
      const catInfo = getCategoryInfo(tx.category as any);
      const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
      return [
        toAscii(tx.description),
        toAscii(tx.merchant_name || '-'),
        toAscii(catInfo.name),
        `${sign}${formatAmount(tx.amount)}`,
      ];
    });

    autoTable(doc, {
      startY: 34,
      head: [[
        toAscii(t('common.description', 'Opis')),
        toAscii(t('common.merchant', 'Trgovac')),
        toAscii(t('common.category', 'Kategorija')),
        toAscii(t('common.amount', 'Iznos')),
      ]],
      body: tableData,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [35, 170, 145] },
      columnStyles: { 3: { halign: 'right' } },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 80;
    let y = finalY + 10;

    doc.setFontSize(11);
    if (selectedDayData.expense > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`${toAscii(t('dashboard.expenses', 'Troskovi'))}: -${formatAmount(selectedDayData.expense)}`, 196, y, { align: 'right' });
      y += 6;
    }
    if (selectedDayData.income > 0) {
      doc.setTextColor(22, 163, 74);
      doc.text(`${toAscii(t('dashboard.income', 'Prihodi'))}: +${formatAmount(selectedDayData.income)}`, 196, y, { align: 'right' });
      y += 6;
    }
    const net = selectedDayData.income - selectedDayData.expense;
    doc.setTextColor(0, 0, 0);
    doc.setFont('Inter', 'bold');
    doc.text(`${toAscii(t('dashboard.calendar.net', 'Neto'))}: ${net >= 0 ? '+' : ''}${formatAmount(net)}`, 196, y, { align: 'right' });

    await exportPDFDoc(doc, `${toAscii(t('dashboard.calendar.title', 'Kalendar'))}_${selectedDay}_${month + 1}_${year}.pdf`, mode);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          <h3 className="text-base sm:text-lg font-semibold">
            {t('dashboard.calendar.title', 'Kalendar potrošnje')}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs sm:text-sm font-medium min-w-[120px] text-center capitalize">
            {monthName}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
        {dayNames.map((name, i) => (
          <div
            key={i}
            className={cn(
              "text-center text-[9px] sm:text-[10px] font-medium text-muted-foreground py-1",
              i >= 5 && "text-muted-foreground/60"
            )}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const data = dailyData[day];
          const hasExpense = data.expense > 0;
          const hasIncome = data.income > 0;
          const intensity = hasExpense ? Math.min(data.expense / maxDayExpense, 1) : 0;
          const isSelected = selectedDay === day;

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={cn(
                "aspect-square rounded-md sm:rounded-lg flex flex-col items-center justify-center relative transition-all text-[10px] sm:text-xs",
                "hover:ring-1 hover:ring-primary/40",
                isToday(day) && "ring-1 ring-primary",
                isSelected && "ring-2 ring-primary bg-primary/10",
                !isSelected && !isToday(day) && "bg-muted/20"
              )}
            >
              <span className={cn(
                "font-medium leading-none",
                isToday(day) && "text-primary font-bold",
                hasExpense && !isToday(day) && "text-foreground"
              )}>
                {day}
              </span>

              {/* Expense heat indicator */}
              {hasExpense && (
                <div
                  className="absolute bottom-0.5 sm:bottom-1 left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    width: `${Math.max(4, intensity * 16)}px`,
                    height: '3px',
                    backgroundColor: `hsl(var(--expense) / ${0.3 + intensity * 0.7})`,
                  }}
                />
              )}

              {/* Income dot */}
              {hasIncome && (
                <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-income/70" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 sm:mt-3 justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-[3px] rounded-full bg-expense/60" />
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{t('dashboard.expenses', 'Troškovi')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-income/70" />
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{t('dashboard.income', 'Prihodi')}</span>
        </div>
      </div>

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedDay && selectedDayData && selectedDayData.transactions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 sm:mt-4 border-t border-border/50 pt-3"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs sm:text-sm font-semibold">
                {selectedDay}. {monthName}
              </h4>
              <div className="flex items-center gap-2">
                {selectedDayData.expense > 0 && (
                  <span className="text-[10px] sm:text-xs font-mono text-expense">
                    -{formatAmount(selectedDayData.expense)}
                  </span>
                )}
                {selectedDayData.income > 0 && (
                  <span className="text-[10px] sm:text-xs font-mono text-income">
                    +{formatAmount(selectedDayData.income)}
                  </span>
                )}
                <ExportButton
                  label=""
                  icon={<FileDown className="w-3.5 h-3.5" />}
                  onExport={exportDayPDF}
                  variant="ghost"
                  size="icon"
                  compact
                  className="h-7 w-7 text-muted-foreground hover:text-foreground p-0"
                />
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {selectedDayData.transactions.map(tx => {
                const catInfo = getCategoryInfo(tx.category as any);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm sm:text-base flex-shrink-0">{catInfo.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{tx.description}</p>
                        {tx.merchant_name && (
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{tx.merchant_name}</p>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs sm:text-sm font-mono font-semibold flex-shrink-0 ml-2",
                      tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'
                    )}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatAmount(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
