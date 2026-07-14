import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface MobileTabDef {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
}

interface MobileProjectTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  /** 4 fixed primary tabs (already filtered by visibility — invisible ones are omitted, positions stay). */
  primary: MobileTabDef[];
  /** Overflow tabs shown inside the "More" bottom sheet. */
  overflow: MobileTabDef[];
}

/**
 * Mobile-only tab navigation for Projects detail.
 *
 * Stable 4+1 layout:
 *  - Up to 4 primary slots in a fixed order. Invisible primary tabs are skipped
 *    (slot is not rendered), but visible primaries never swap positions.
 *  - 5th slot = "More" button. Opens bottom sheet with overflow tabs.
 *  - Active overflow tab shows only a small dot indicator on "More" — the
 *    primary row never changes based on what is active.
 *
 * Desktop/sm+ should render the full TabsList elsewhere; this component is
 * meant to be wrapped in `sm:hidden`.
 */
export function MobileProjectTabs({ value, onValueChange, primary, overflow }: MobileProjectTabsProps) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const overflowSubtitle = (key: string): string => {
    switch (key) {
      case 'funding':
        return t('projects.tabs.subtitles.funding', 'Izvori i alokacije');
      case 'transactions':
        return t('projects.tabs.subtitles.transactions', 'Troškovi i prihodi');
      case 'worklog':
        return t('projects.tabs.subtitles.worklog', 'Sati i napredak');
      case 'documents':
        return t('projects.tabs.subtitles.documents', 'Računi i datoteke');
      case 'activity':
        return t('projects.tabs.subtitles.activity', 'Povijest promjena');
      default:
        return '';
    }
  };

  const activeIsOverflow = overflow.some((tab) => tab.key === value);
  const slotCount = primary.length + (overflow.length > 0 ? 1 : 0);

  if (slotCount === 0) return null;

  const handleSelect = (key: string) => {
    onValueChange(key);
    setSheetOpen(false);
  };

  return (
    <div className="mb-6 sm:hidden">
      <div
        role="tablist"
        className="grid gap-1 p-1 rounded-xl bg-muted/40 border border-border/50"
        style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
      >
        {primary.map((tab) => {
          const Icon = tab.icon;
          const selected = value === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => handleSelect(tab.key)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-background text-module shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('w-4 h-4 text-module transition-opacity', selected ? 'opacity-100' : 'opacity-50')} />
              <span className="leading-tight truncate max-w-full">{tab.label}</span>
              {tab.badge && (
                <span className="absolute top-0.5 right-1">{tab.badge}</span>
              )}
            </button>
          );
        })}

        {overflow.length > 0 && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={t('projects.tabs.more', 'Više')}
                aria-haspopup="dialog"
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeIsOverflow
                    ? 'text-module'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MoreHorizontal className={cn('w-4 h-4 text-module transition-opacity', activeIsOverflow ? 'opacity-100' : 'opacity-50')} />
                <span className="leading-tight">
                  {t('projects.tabs.more', 'Više')}
                </span>
                {activeIsOverflow && (
                  <span
                    aria-hidden
                    className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-module"
                  />
                )}
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl p-0 max-h-[85svh] flex flex-col"
            >
              <SheetHeader className="text-left px-6 pt-6 pb-2 shrink-0">
                <SheetTitle className="text-module-muted">
                  {t('projects.tabs.moreSheetTitle', 'Sve sekcije')}
                </SheetTitle>
              </SheetHeader>
              <div
                className="mt-2 flex flex-col gap-2 overflow-y-auto px-6"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
              >
                {overflow.map((tab) => {
                  const Icon = tab.icon;
                  const selected = value === tab.key;
                  const subtitle = overflowSubtitle(tab.key);
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => handleSelect(tab.key)}
                      className={cn(
                        'flex items-center gap-3 min-h-[64px] px-3 py-3 rounded-xl border border-border/50 bg-card text-left transition active:scale-[0.98]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected
                          ? 'bg-module/10 border-module/40'
                          : 'hover:bg-muted/60'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-module/15',
                          selected && 'bg-module/25'
                        )}
                      >
                        <Icon className="w-5 h-5 text-module" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'block text-sm font-medium',
                            selected ? 'text-module' : 'text-foreground'
                          )}
                        >
                          {tab.label}
                        </span>
                        {subtitle && (
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            {subtitle}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {tab.badge && <span>{tab.badge}</span>}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
