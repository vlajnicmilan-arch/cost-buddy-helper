/**
 * ReadOnlyBanner — inline banner koji objašnjava zašto je modul u
 * read-only stanju i vodi na paywall. Nikad ne skriva podatke.
 */
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReadOnlyBannerProps {
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  className?: string;
}

export const ReadOnlyBanner = ({
  title,
  body,
  ctaLabel,
  ctaTarget = '/paywall',
  className,
}: ReadOnlyBannerProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {title ?? t('access.readOnlyTitle', 'Modul je u načinu samo za pregled')}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {body ?? t('access.readOnlyBody', 'Podatke vidiš i možeš izvesti. Za dodavanje i uređivanje aktiviraj pretplatu.')}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="rounded-lg shrink-0"
        onClick={() => navigate(ctaTarget)}
      >
        {ctaLabel ?? t('access.cta', 'Aktiviraj pretplatu')}
      </Button>
    </div>
  );
};
