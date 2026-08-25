import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Trash2, BellOff } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useRejectionMemory, type RejectionMemoryEntry } from '@/hooks/useRejectionMemory';
import { formatDateHr } from '@/lib/dateFormat';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';

/**
 * Settings → „Uvoz iz e-maila" → ŠTO SAM ODBACIO.
 *
 * Sestrinski ekran „Mojim izdavateljima": pravila nastala odbacivanjem. Nakon
 * dva odbijanja ista vrsta poruke od istog pošiljatelja više ne ulazi u red.
 * Brisanje pravila vraća tu vrstu poruke u pregled.
 */
export const MyRejectionsSection = () => {
  const { t } = useTranslation();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const { entries, loading, working, forgetEntry } = useRejectionMemory(hasAccess);
  const [pending, setPending] = useState<RejectionMemoryEntry | null>(null);

  if (accessLoading || !hasAccess) return null;

  const handleForget = async () => {
    if (!pending) return;
    const ok = await forgetEntry(pending.id);
    setPending(null);
    if (ok) showSuccess(t('rejections.forgotten', 'Pravilo je obrisano'));
    else showError(t('rejections.forgetFailed', 'Brisanje nije uspjelo'));
  };

  return (
    <CollapsibleSection
      title={t('rejections.title', 'Što sam odbacio')}
      count={entries.length}
      testId="my-rejections-section"
    >
      <div className="space-y-4 pt-1">
        <p className="text-xs text-muted-foreground">
          {t(
            'rejections.description',
            'Ista vrsta poruke odbačena dvaput više ne ulazi u pregled. Ništa nije obrisano — brisanjem pravila te poruke opet dolaze.',
          )}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading', 'Učitavanje...')}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('rejections.empty', 'Još nema naučenih odbijanja.')}
          </p>
        )}

        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} data-testid="rejection-memory-row" className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {e.last_subject || t('mailImport.noSubject', '(bez naslova)')}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">{e.sender_email}</p>
                  <p className="text-xs text-muted-foreground">{formatDateHr(e.updated_at)}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="min-h-[44px] min-w-[44px] shrink-0"
                  disabled={working}
                  aria-label={t('rejections.forget', 'Zaboravi pravilo')}
                  onClick={() => setPending(e)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Badge variant={e.reject_count >= 2 ? 'secondary' : 'outline'} className="gap-1">
                <BellOff className="h-3 w-3" />
                {e.reject_count >= 2
                  ? t('rejections.muted', 'Utišano · odbačeno {{count}}×', { count: e.reject_count })
                  : t('rejections.counting', 'Odbačeno {{count}}×', { count: e.reject_count })}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rejections.forgetTitle', 'Zaboraviti pravilo?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'rejections.forgetDescription',
                'Takve poruke opet će dolaziti na pregled.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleForget}>
              {t('rejections.forget', 'Zaboravi pravilo')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CollapsibleSection>
  );
};
