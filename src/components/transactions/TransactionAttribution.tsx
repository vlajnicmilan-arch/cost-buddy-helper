import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  displayName: string | undefined;
  createdAt: string | Date | undefined;
  className?: string;
}

/**
 * Small attribution chip rendered under a shared-resource transaction.
 * Shows initials avatar + member name + relative time.
 */
export const TransactionAttribution = ({ userId, displayName, createdAt, className }: Props) => {
  const { t, i18n } = useTranslation();

  const locale = i18n.language === 'en' ? enUS : i18n.language === 'de' ? de : hr;

  const initials = useMemo(() => {
    const name = (displayName || '').trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [displayName]);

  // Stable, friendly per-user color (HSL hue derived from user_id).
  const hue = useMemo(() => {
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
    return h;
  }, [userId]);

  const relative = createdAt
    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale })
    : '';

  const label = displayName || t('transactions.attribution.unknownMember', 'Bivši član');

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 text-[10px] text-muted-foreground leading-none mt-1',
        className,
      )}
    >
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-semibold text-white shrink-0"
        style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="truncate max-w-[120px]">{label}</span>
      {relative && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="shrink-0">{relative}</span>
        </>
      )}
    </div>
  );
};
