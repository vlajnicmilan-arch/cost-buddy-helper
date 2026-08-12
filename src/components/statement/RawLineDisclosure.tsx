import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * CITAT S IZVODA — „Kako piše na izvodu ▾".
 *
 * Zatvoreno po zadanom: nula utjecaja na širinu i urednost kartice. Kad je
 * citat AI prepis (sken bez tekstualnog sloja), to se vidi kao sitna napomena —
 * prepis nije dokaz nego interpretacija.
 */
export const RawLineDisclosure = ({
  rawLine,
  source,
  className,
}: {
  rawLine?: string | null;
  source?: string | null;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!rawLine) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('mt-1', className)}>
      <CollapsibleTrigger className="flex items-center gap-1 min-h-11 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        {t('rawLine.toggle')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">{rawLine}</p>
        {source === 'ai' && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t('rawLine.aiNote')}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
