/**
 * ShowMoreButton — zajednički gumb uz `useShowMore`.
 *
 * Koristi postojeći i18n ključ `common.showMore`. Renderira se samo kad
 * `hasMore` (roditelj proslijedi vrijednost iz hooka).
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface Props {
  hasMore: boolean;
  remaining?: number;
  onClick: () => void;
  className?: string;
}

export function ShowMoreButton({ hasMore, remaining, onClick, className }: Props) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <div className={`flex justify-center py-2 ${className ?? ''}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-[44px] text-xs"
        onClick={onClick}
        data-testid="show-more"
      >
        <ChevronDown className="w-4 h-4 mr-1" />
        {t('common.showMore', 'Prikaži više')}
        {typeof remaining === 'number' && remaining > 0 ? ` (${remaining})` : ''}
      </Button>
    </div>
  );
}

export default ShowMoreButton;
