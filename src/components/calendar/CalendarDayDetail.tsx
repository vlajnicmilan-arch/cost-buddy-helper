import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { getCategoryInfo } from '@/types/expense';
import { cn } from '@/lib/utils';
import { Check, Trash2, Cake, CreditCard, AlertTriangle, CalendarDays, RefreshCw, CalendarPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { downloadCalendarEventICS } from '@/lib/icsExport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
  onToggleComplete: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const typeIcons: Record<string, any> = {
  birthday: Cake,
  planned_expense: CreditCard,
  deadline: AlertTriangle,
  reminder: CalendarDays,
  custom: CalendarDays,
};

const typeColors: Record<string, string> = {
  expense: 'text-red-500',
  income: 'text-green-500',
  transfer: 'text-blue-500',
  reminder: 'text-orange-500',
  birthday: 'text-pink-500',
  planned_expense: 'text-amber-500',
  deadline: 'text-red-600',
};

export const CalendarDayDetail = ({ open, onOpenChange, date, events, onToggleComplete, onDelete }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();

  const dateObj = parseISO(date);
  const formattedDate = format(dateObj, 'd. MMMM yyyy', { locale: hr });

  const handleDelete = async (event: CalendarEvent) => {
    if (event.source !== 'reminder') return;
    try {
      await onDelete(event.id);
      showSuccess('Obrisano');
    } catch {
      showError('Greška');
    }
  };

  const handleToggle = async (event: CalendarEvent) => {
    if (event.source !== 'reminder') return;
    try {
      await onToggleComplete(event.id, !event.isCompleted);
    } catch {
      showError('Greška');
    }
  };

  const handleExportICS = async (event: CalendarEvent) => {
    try {
      await downloadCalendarEventICS({
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        amount: event.amount,
        type: event.type,
        source: event.source,
      });
      showSuccess(t('calendar.exportedToCalendar', 'Izvezeno'));
    } catch {
      showError('Greška');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left">{formattedDate}</SheetTitle>
        </SheetHeader>

        <div className="space-y-2 mt-4 overflow-y-auto max-h-[50vh]">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('calendar.noEvents', 'Nema stavki za ovaj dan')}
            </p>
          )}

          {events.map(event => {
            const isTransaction = event.source === 'expense';
            const isRecurring = event.source === 'recurring';
            const isReminder = event.source === 'reminder';
            const catInfo = event.category ? getCategoryInfo(event.category as any) : null;
            const Icon = isRecurring ? RefreshCw : typeIcons[event.type] || CalendarDays;

            return (
              <div
                key={event.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-colors",
                  "bg-muted/30 hover:bg-muted/50",
                  event.isCompleted && "opacity-50"
                )}
              >
                {/* Icon */}
                <div className={cn("flex-shrink-0", typeColors[event.type] || 'text-muted-foreground')}>
                  {catInfo ? (
                    <span className="text-lg">{catInfo.icon}</span>
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", event.isCompleted && "line-through")}>
                    {event.title}
                  </p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("text-[10px] uppercase font-medium tracking-wider", typeColors[event.type])}>
                      {event.source === 'recurring' ? t('calendar.recurring', 'Ponavljajuća') :
                       event.type === 'birthday' ? t('calendar.birthday', 'Rođendan') :
                       event.type === 'planned_expense' ? t('calendar.plannedExpense', 'Planirano') :
                       event.type === 'deadline' ? t('calendar.deadline', 'Rok') :
                       event.type === 'income' ? t('dashboard.income', 'Prihod') :
                       event.type === 'expense' ? t('dashboard.expenses', 'Trošak') :
                       event.type === 'transfer' ? t('common.transfer', 'Transfer') :
                       t('calendar.event', 'Događaj')}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                {event.amount != null && (
                  <span className={cn(
                    "text-sm font-mono font-semibold flex-shrink-0",
                    event.type === 'income' ? 'text-green-500' : 'text-red-500'
                  )}>
                    {event.type === 'income' ? '+' : '-'}{formatAmount(event.amount)}
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleExportICS(event)}
                    title={t('calendar.addToCalendar', 'Dodaj u kalendar')}
                  >
                    <CalendarPlus className="w-4 h-4" />
                  </Button>
                  {isReminder && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleToggle(event)}
                      >
                        <Check className={cn("w-4 h-4", event.isCompleted && "text-green-500")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(event)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
