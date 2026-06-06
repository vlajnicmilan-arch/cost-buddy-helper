import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useTranslation } from 'react-i18next';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clickableProps } from '@/lib/a11y';

export interface MoreTabItem {
  value: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  description?: string;
}

interface ProjectMoreTabsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MoreTabItem[];
  onSelect: (value: string) => void;
}

/**
 * Bottom sheet that lists tabs hidden from the Lite tab strip.
 * Tap an item → activate it in ProjectFullScreenView and close the sheet.
 */
export const ProjectMoreTabsSheet = ({
  open,
  onOpenChange,
  items,
  onSelect,
}: ProjectMoreTabsSheetProps) => {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{t('projects.moreTabs.title', 'Više')}</SheetTitle>
          <SheetDescription>
            {t('projects.moreTabs.description', 'Dodatni dijelovi projekta.')}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-1 gap-2 pb-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.value}
                {...clickableProps(
                  () => {
                    onSelect(item.value);
                    onOpenChange(false);
                  },
                  {
                    label: item.label,
                    className: cn(
                      'flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/30',
                      'hover:bg-muted/60 active:bg-muted/80 transition-colors cursor-pointer'
                    ),
                  }
                )}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{item.label}</span>
                    {item.badge !== undefined && item.badge !== '' && Number(item.badge) !== 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
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
